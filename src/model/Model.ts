import type {
  BcadLoad,
  BcadMember,
  BcadNode,
  DraftPlane,
  LoadCase,
  LoadCaseType,
  LoadCombo,
  MaterialType,
  MemberFixity,
  ModelChangeEvent,
  ModelSnapshot,
  NodeFixity,
  ProjectionMode,
  SectionShape,
  Selection,
  SelectionSet,
  UbcParams,
  ViewPreset,
} from "../types";

/**
 * In-memory model store. Holds nodes and members, generates sequential
 * ids/labels, answers spatial + lookup queries, and emits change events.
 *
 * This is the single source of truth: the 3D view and the DOM panels both
 * subscribe to it, so they never hold duplicate state.
 */
export class Model {
  private nodes = new Map<number, BcadNode>();
  private members = new Map<number, BcadMember>();
  private loadCases = new Map<number, LoadCase>();
  private loads = new Map<number, BcadLoad>();
  private loadCombos = new Map<number, LoadCombo>();
  private nextNodeId = 1;
  private nextMemberId = 1;
  private nextLoadCaseId = 1;
  private nextLoadId = 1;
  private nextLoadComboId = 1;

  private listeners = new Set<(e: ModelChangeEvent) => void>();

  // ---- subscription ----
  on(fn: (e: ModelChangeEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: ModelChangeEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  // ---- reads ----
  getNode(id: number): BcadNode | undefined {
    return this.nodes.get(id);
  }

  getMember(id: number): BcadMember | undefined {
    return this.members.get(id);
  }

  allNodes(): BcadNode[] {
    return [...this.nodes.values()];
  }

  allMembers(): BcadMember[] {
    return [...this.members.values()];
  }

  nodeCount(): number {
    return this.nodes.size;
  }

  memberCount(): number {
    return this.members.size;
  }

  /** Find a node within `tol` distance of (x,y,z). Returns undefined if none. */
  findNodeNear(x: number, y: number, z: number, tol: number): BcadNode | undefined {
    let best: BcadNode | undefined;
    let bestD2 = tol * tol;
    for (const n of this.nodes.values()) {
      const d2 = (n.x - x) ** 2 + (n.y - y) ** 2 + (n.z - z) ** 2;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = n;
      }
    }
    return best;
  }

  /** Find an existing node at (x,y,z) within a tiny epsilon (duplicate guard). */
  findNodeAt(x: number, y: number, z: number): BcadNode | undefined {
    return this.findNodeNear(x, y, z, 1e-6);
  }

  /** Members connected to a node (for cascade delete + tree context). */
  membersAtNode(nodeId: number): BcadMember[] {
    const out: BcadMember[] = [];
    for (const m of this.members.values()) {
      if (m.nodeAId === nodeId || m.nodeBId === nodeId) out.push(m);
    }
    return out;
  }

  // ---- load reads ----

  getLoadCase(id: number): LoadCase | undefined {
    return this.loadCases.get(id);
  }

  getLoad(id: number): BcadLoad | undefined {
    return this.loads.get(id);
  }

  getLoadCombo(id: number): LoadCombo | undefined {
    return this.loadCombos.get(id);
  }

  allLoadCases(): LoadCase[] {
    return [...this.loadCases.values()];
  }

  allLoads(): BcadLoad[] {
    return [...this.loads.values()];
  }

  allLoadCombos(): LoadCombo[] {
    return [...this.loadCombos.values()];
  }

  loadCaseCount(): number {
    return this.loadCases.size;
  }

  loadCount(): number {
    return this.loads.size;
  }

  loadComboCount(): number {
    return this.loadCombos.size;
  }

  // ---- mutations ----

  /**
   * Internal node creator/reuser. Does NOT emit a change event — used by the
   * batched copy/array ops so they can add many entities and emit once.
   * Returns the resulting node (created or existing, since exact-spot nodes
   * are deduped).
   */
  private putNode(x: number, y: number, z: number, label?: string): BcadNode {
    const existing = this.findNodeAt(x, y, z);
    if (existing) return existing;

    const id = this.nextNodeId++;
    const node: BcadNode = { id, label: label ?? `N${id}`, x, y, z };
    this.nodes.set(id, node);
    return node;
  }

  /** Returns true iff the last putNode/putMember actually created something. */
  private createdNode(before: number): boolean {
    return this.nextNodeId !== before;
  }
  private createdMember(before: number): boolean {
    return this.nextMemberId !== before;
  }

  /**
   * Add a node at a coordinate. If a node already exists at that exact spot,
   * reuse it (snap/dedup). Returns the resulting node (created or existing).
   */
  addNode(x: number, y: number, z: number, label?: string): BcadNode {
    const before = this.nextNodeId;
    const node = this.putNode(x, y, z, label);
    if (this.createdNode(before)) this.emit({ reason: "add", kind: "node", id: node.id });
    return node;
  }

  /** Update a node's coordinates, label, and/or joint weight. */
  updateNode(id: number, patch: Partial<Pick<BcadNode, "x" | "y" | "z" | "label" | "weight">>): boolean {
    const n = this.nodes.get(id);
    if (!n) return false;
    Object.assign(n, patch);
    this.emit({ reason: "update", kind: "node", id });
    return true;
  }

  /** Set or clear the fixity (restraints) on a node. */
  updateNodeFixity(id: number, fixity: NodeFixity): boolean {
    const n = this.nodes.get(id);
    if (!n) return false;
    n.fixity = fixity;
    this.emit({ reason: "update", kind: "node", id });
    return true;
  }

  /**
   * Internal member creator. Does NOT emit. Refuses zero-length or dangling
   * pairs and dedupes an identical pair (either order). Returns the resulting
   * member (created or existing) or undefined if refused.
   */
  private putMember(
    nodeAId: number,
    nodeBId: number,
    opts?: { label?: string; tag?: BcadMember["tag"] }
  ): BcadMember | undefined {
    if (nodeAId === nodeBId) return undefined;
    if (!this.nodes.has(nodeAId) || !this.nodes.has(nodeBId)) return undefined;

    // Dedupe: same pair (either order) already exists.
    for (const m of this.members.values()) {
      const same =
        (m.nodeAId === nodeAId && m.nodeBId === nodeBId) ||
        (m.nodeAId === nodeBId && m.nodeBId === nodeAId);
      if (same) return m;
    }

    const id = this.nextMemberId++;
    const member: BcadMember = {
      id,
      label: opts?.label ?? `M${id}`,
      nodeAId,
      nodeBId,
      tag: opts?.tag ?? "none",
    };
    this.members.set(id, member);
    return member;
  }

  /**
   * Add a member between two node ids. If both endpoints resolve to the same
   * node, refuses (zero-length) and returns undefined. Dedupes duplicates.
   */
  addMember(
    nodeAId: number,
    nodeBId: number,
    opts?: { label?: string; tag?: BcadMember["tag"] }
  ): BcadMember | undefined {
    const before = this.nextMemberId;
    const member = this.putMember(nodeAId, nodeBId, opts);
    if (member && this.createdMember(before)) {
      this.emit({ reason: "add", kind: "member", id: member.id });
    }
    return member;
  }

  // ---- copy / array ----
  //
  // All of these shift by a (dx,dy,dz) offset and reuse putNode/putMember, so
  // copies that land on existing geometry snap/dedupe just like hand-drawn
  // entities. Batch ops emit a single change event at the end (the view does a
  // full rebuild per event, so one event keeps arrays of hundreds cheap).

  /** Copy a node by an offset; returns the copy (or the existing node it snapped onto). */
  copyNode(id: number, dx: number, dy: number, dz: number): BcadNode | undefined {
    const n = this.nodes.get(id);
    if (!n) return undefined;
    const before = this.nextNodeId;
    const node = this.putNode(n.x + dx, n.y + dy, n.z + dz);
    if (this.createdNode(before)) this.emit({ reason: "add", kind: "node", id: node.id });
    return node;
  }

  /** Copy a member by an offset: duplicates both endpoints and the connecting member (tag kept). */
  copyMember(id: number, dx: number, dy: number, dz: number): BcadMember | undefined {
    const m = this.members.get(id);
    if (!m) return undefined;
    const a = this.nodes.get(m.nodeAId);
    const b = this.nodes.get(m.nodeBId);
    if (!a || !b) return undefined;
    const na = this.putNode(a.x + dx, a.y + dy, a.z + dz);
    const nb = this.putNode(b.x + dx, b.y + dy, b.z + dz);
    const mem = this.putMember(na.id, nb.id, { tag: m.tag });
    if (mem) this.emit({ reason: "add", kind: "member", id: mem.id });
    return mem;
  }

  /** Linear-array a node: count copies at pos + offset·i (i = 1..count). */
  arrayNode(id: number, dx: number, dy: number, dz: number, count: number): BcadNode[] {
    const n = this.nodes.get(id);
    if (!n || count <= 0) return [];
    const out: BcadNode[] = [];
    for (let i = 1; i <= count; i++) {
      out.push(this.putNode(n.x + dx * i, n.y + dy * i, n.z + dz * i));
    }
    if (out.length) this.emit({ reason: "add", kind: "node" });
    return out;
  }

  /** Linear-array a member: count shifted copies, each with its own node pair. */
  arrayMember(
    id: number,
    dx: number,
    dy: number,
    dz: number,
    count: number
  ): BcadMember[] {
    const m = this.members.get(id);
    if (!m || count <= 0) return [];
    const a = this.nodes.get(m.nodeAId);
    const b = this.nodes.get(m.nodeBId);
    if (!a || !b) return [];
    const out: BcadMember[] = [];
    for (let i = 1; i <= count; i++) {
      const na = this.putNode(a.x + dx * i, a.y + dy * i, a.z + dz * i);
      const nb = this.putNode(b.x + dx * i, b.y + dy * i, b.z + dz * i);
      const mem = this.putMember(na.id, nb.id, { tag: m.tag });
      if (mem) out.push(mem);
    }
    if (out.length) this.emit({ reason: "add", kind: "member" });
    return out;
  }

  /** Copy whatever is selected; returns a selection of the newly created entity, or null. */
  copySelection(sel: Selection, dx: number, dy: number, dz: number): Selection | null {
    if (sel.kind === "node") {
      const n = this.copyNode(sel.id, dx, dy, dz);
      return n ? { kind: "node", id: n.id } : null;
    }
    const m = this.copyMember(sel.id, dx, dy, dz);
    return m ? { kind: "member", id: m.id } : null;
  }

  /** Array whatever is selected; returns a selection of the last copy, or null. */
  arraySelection(
    sel: Selection,
    dx: number,
    dy: number,
    dz: number,
    count: number
  ): Selection | null {
    if (sel.kind === "node") {
      const arr = this.arrayNode(sel.id, dx, dy, dz, count);
      const last = arr[arr.length - 1];
      return last ? { kind: "node", id: last.id } : null;
    }
    const arr = this.arrayMember(sel.id, dx, dy, dz, count);
    const last = arr[arr.length - 1];
    return last ? { kind: "member", id: last.id } : null;
  }

  // ---- polar copy / array ----
  //
  // Rotate copies about a center (cx,cy) in the XY plane (around the Z axis),
  // the natural axis for a top-down drafting plane. Each copy at angle = base
  // angle + step·i (radians). z is carried through unchanged. As with linear
  // ops, copies snap/dedupe onto existing geometry and emit a single batch event.

  /** Rotate a point about (cx,cy) by `ang` radians (XY plane, Z fixed). */
  private rotateAbout(
    x: number,
    y: number,
    z: number,
    cx: number,
    cy: number,
    ang: number
  ): [number, number, number] {
    const dx = x - cx;
    const dy = y - cy;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos, z];
  }

  /** Polar-copy a node by one angular step about (cx,cy). */
  copyNodePolar(id: number, cx: number, cy: number, ang: number): BcadNode | undefined {
    const n = this.nodes.get(id);
    if (!n || ang === 0) return n;
    const before = this.nextNodeId;
    const [x, y, z] = this.rotateAbout(n.x, n.y, n.z, cx, cy, ang);
    const node = this.putNode(x, y, z);
    if (this.createdNode(before)) this.emit({ reason: "add", kind: "node", id: node.id });
    return node;
  }

  /** Polar-copy a member by one angular step about (cx,cy) (both endpoints + member, tag kept). */
  copyMemberPolar(id: number, cx: number, cy: number, ang: number): BcadMember | undefined {
    const m = this.members.get(id);
    if (!m || ang === 0) return m;
    const a = this.nodes.get(m.nodeAId);
    const b = this.nodes.get(m.nodeBId);
    if (!a || !b) return undefined;
    const [ax, ay, az] = this.rotateAbout(a.x, a.y, a.z, cx, cy, ang);
    const [bx, by, bz] = this.rotateAbout(b.x, b.y, b.z, cx, cy, ang);
    const na = this.putNode(ax, ay, az);
    const nb = this.putNode(bx, by, bz);
    const mem = this.putMember(na.id, nb.id, { tag: m.tag });
    if (mem) this.emit({ reason: "add", kind: "member", id: mem.id });
    return mem;
  }

  /** Polar-array a node: count copies stepping by `step` radians about (cx,cy). */
  arrayNodePolar(
    id: number,
    cx: number,
    cy: number,
    step: number,
    count: number
  ): BcadNode[] {
    const n = this.nodes.get(id);
    if (!n || count <= 0 || step === 0) return [];
    const out: BcadNode[] = [];
    for (let i = 1; i <= count; i++) {
      const [x, y, z] = this.rotateAbout(n.x, n.y, n.z, cx, cy, step * i);
      out.push(this.putNode(x, y, z));
    }
    if (out.length) this.emit({ reason: "add", kind: "node" });
    return out;
  }

  /** Polar-array a member: count rotated copies, each with its own node pair. */
  arrayMemberPolar(
    id: number,
    cx: number,
    cy: number,
    step: number,
    count: number
  ): BcadMember[] {
    const m = this.members.get(id);
    if (!m || count <= 0 || step === 0) return [];
    const a = this.nodes.get(m.nodeAId);
    const b = this.nodes.get(m.nodeBId);
    if (!a || !b) return [];
    const out: BcadMember[] = [];
    for (let i = 1; i <= count; i++) {
      const [ax, ay, az] = this.rotateAbout(a.x, a.y, a.z, cx, cy, step * i);
      const [bx, by, bz] = this.rotateAbout(b.x, b.y, b.z, cx, cy, step * i);
      const na = this.putNode(ax, ay, az);
      const nb = this.putNode(bx, by, bz);
      const mem = this.putMember(na.id, nb.id, { tag: m.tag });
      if (mem) out.push(mem);
    }
    if (out.length) this.emit({ reason: "add", kind: "member" });
    return out;
  }

  /** Polar-copy whatever is selected; returns a selection of the copy, or null. */
  copySelectionPolar(
    sel: Selection,
    cx: number,
    cy: number,
    ang: number
  ): Selection | null {
    if (sel.kind === "node") {
      const n = this.copyNodePolar(sel.id, cx, cy, ang);
      return n ? { kind: "node", id: n.id } : null;
    }
    const m = this.copyMemberPolar(sel.id, cx, cy, ang);
    return m ? { kind: "member", id: m.id } : null;
  }

  /** Polar-array whatever is selected; returns a selection of the last copy, or null. */
  arraySelectionPolar(
    sel: Selection,
    cx: number,
    cy: number,
    step: number,
    count: number
  ): Selection | null {
    if (sel.kind === "node") {
      const arr = this.arrayNodePolar(sel.id, cx, cy, step, count);
      const last = arr[arr.length - 1];
      return last ? { kind: "node", id: last.id } : null;
    }
    const arr = this.arrayMemberPolar(sel.id, cx, cy, step, count);
    const last = arr[arr.length - 1];
    return last ? { kind: "member", id: last.id } : null;
  }

  // ---- set-aware copy / array / remove ----
  //
  // These duplicate (or remove) an entire selection together. The key trick for
  // copy/array: build an oldId→newId map while duplicating nodes, so when a
  // member's endpoint is itself part of the copied set, the copy reconnects to
  // the copied node instead of spawning a stray one — connected groups stay
  // connected. All silent; one emit at the end (cheap rebuild).

  /**
   * Duplicate a whole selection by a (dx,dy,dz) offset. Returns the set of
   * created entities (one pass per copy, in the same order).
   */
  copySet(set: SelectionSet, dx: number, dy: number, dz: number): SelectionSet {
    const nodeMap = new Map<number, number>();
    const out: SelectionSet = [];
    // Nodes first so member endpoints can resolve through the map.
    for (const s of set) {
      if (s.kind !== "node") continue;
      const n = this.nodes.get(s.id);
      if (!n) continue;
      const copy = this.putNode(n.x + dx, n.y + dy, n.z + dz);
      nodeMap.set(s.id, copy.id);
      out.push({ kind: "node", id: copy.id });
    }
    for (const s of set) {
      if (s.kind !== "member") continue;
      const m = this.members.get(s.id);
      if (!m) continue;
      const na = this.resolveEndpoint(m.nodeAId, nodeMap, dx, dy, dz);
      const nb = this.resolveEndpoint(m.nodeBId, nodeMap, dx, dy, dz);
      const mem = this.putMember(na, nb, { tag: m.tag });
      if (mem) out.push({ kind: "member", id: mem.id });
    }
    if (out.length) this.emit({ reason: "add" });
    return out;
  }

  /**
   * Linear-array a whole selection: `count` passes, each offset by i·(dx,dy,dz).
   * Connectivity is preserved WITHIN a single pass (copied members link to
   * copied nodes), not across passes. Returns the full set of created entities.
   */
  arraySet(
    set: SelectionSet,
    dx: number,
    dy: number,
    dz: number,
    count: number
  ): SelectionSet {
    const out: SelectionSet = [];
    for (let i = 1; i <= count; i++) {
      out.push(...this.copySet(set, dx * i, dy * i, dz * i));
    }
    // copySet emits per pass; collapse to one final summary emit.
    return out;
  }

  /** Polar-copy a whole selection one angular step about (cx,cy). */
  copySetPolar(
    set: SelectionSet,
    cx: number,
    cy: number,
    ang: number
  ): SelectionSet {
    const nodeMap = new Map<number, number>();
    const out: SelectionSet = [];
    for (const s of set) {
      if (s.kind !== "node") continue;
      const n = this.nodes.get(s.id);
      if (!n) continue;
      const [x, y, z] = this.rotateAbout(n.x, n.y, n.z, cx, cy, ang);
      const copy = this.putNode(x, y, z);
      nodeMap.set(s.id, copy.id);
      out.push({ kind: "node", id: copy.id });
    }
    for (const s of set) {
      if (s.kind !== "member") continue;
      const m = this.members.get(s.id);
      if (!m) continue;
      const na = this.resolveEndpointPolar(m.nodeAId, nodeMap, cx, cy, ang);
      const nb = this.resolveEndpointPolar(m.nodeBId, nodeMap, cx, cy, ang);
      const mem = this.putMember(na, nb, { tag: m.tag });
      if (mem) out.push({ kind: "member", id: mem.id });
    }
    if (out.length) this.emit({ reason: "add" });
    return out;
  }

  /** Polar-array a whole selection: count passes about (cx,cy) by `step` radians. */
  arraySetPolar(
    set: SelectionSet,
    cx: number,
    cy: number,
    step: number,
    count: number
  ): SelectionSet {
    const out: SelectionSet = [];
    for (let i = 1; i <= count; i++) {
      out.push(...this.copySetPolar(set, cx, cy, step * i));
    }
    return out;
  }

  /** Resolve a member endpoint through the copy map, or create a shifted node. */
  private resolveEndpoint(
    oldId: number,
    nodeMap: Map<number, number>,
    dx: number,
    dy: number,
    dz: number
  ): number {
    const mapped = nodeMap.get(oldId);
    if (mapped !== undefined) return mapped;
    const n = this.nodes.get(oldId);
    if (!n) return oldId; // dangling — let putMember refuse it
    return this.putNode(n.x + dx, n.y + dy, n.z + dz).id;
  }

  /** Polar variant of resolveEndpoint. */
  private resolveEndpointPolar(
    oldId: number,
    nodeMap: Map<number, number>,
    cx: number,
    cy: number,
    ang: number
  ): number {
    const mapped = nodeMap.get(oldId);
    if (mapped !== undefined) return mapped;
    const n = this.nodes.get(oldId);
    if (!n) return oldId;
    const [x, y, z] = this.rotateAbout(n.x, n.y, n.z, cx, cy, ang);
    return this.putNode(x, y, z).id;
  }

  /**
   * Remove every entity in a selection set. Members are removed first so a
   * selected node doesn't get cascade-deleted before we can act on it. Emits
   * exactly once at the end. Loads attached to removed nodes/members are
   * cascade-dropped too.
   */
  removeSelections(set: SelectionSet): void {
    const members = set.filter((s) => s.kind === "member");
    const nodes = set.filter((s) => s.kind === "node");
    let changed = false;
    for (const s of members) {
      if (this.members.delete(s.id)) {
        this.cascadeMemberLoads(s.id);
        changed = true;
      }
    }
    for (const s of nodes) {
      // Cascade-remove this node's members and loads too.
      if (this.nodes.delete(s.id)) {
        for (const m of this.membersAtNode(s.id)) {
          this.members.delete(m.id);
          this.cascadeMemberLoads(m.id);
        }
        this.cascadeNodeLoads(s.id);
        changed = true;
      }
    }
    if (changed) this.emit({ reason: "remove" });
  }

  /** Update a member's label, endpoints, tag, section props, and/or beta. */
  updateMember(
    id: number,
    patch: Partial<Pick<BcadMember, "label" | "nodeAId" | "nodeBId" | "tag" | "materialGrade" | "sectionProps" | "beta">>
  ): boolean {
    const m = this.members.get(id);
    if (!m) return false;
    Object.assign(m, patch);
    this.emit({ reason: "update", kind: "member", id });
    return true;
  }

  /** Set or clear the end fixity on a member. */
  updateMemberFixity(id: number, fixity: MemberFixity): boolean {
    const m = this.members.get(id);
    if (!m) return false;
    m.fixity = fixity;
    this.emit({ reason: "update", kind: "member", id });
    return true;
  }

  /** Set the material type on a member. */
  updateMemberMaterial(id: number, material: MaterialType): boolean {
    const m = this.members.get(id);
    if (!m) return false;
    m.material = material;
    this.emit({ reason: "update", kind: "member", id });
    return true;
  }

  /** Set the cross-section shape on a member. */
  updateMemberSection(id: number, section: SectionShape): boolean {
    const m = this.members.get(id);
    if (!m) return false;
    m.section = section;
    this.emit({ reason: "update", kind: "member", id });
    return true;
  }

  /** Remove a node; also removes every member and load that referenced it. */
  removeNode(id: number): boolean {
    const existed = this.nodes.delete(id);
    if (!existed) return false;
    for (const m of this.membersAtNode(id)) {
      this.members.delete(m.id);
      this.cascadeMemberLoads(m.id);
    }
    this.cascadeNodeLoads(id);
    this.emit({ reason: "remove" });
    return true;
  }

  /** Remove a member only (keeps its nodes, drops its loads). */
  removeMember(id: number): boolean {
    const existed = this.members.delete(id);
    if (!existed) return false;
    this.cascadeMemberLoads(id);
    this.emit({ reason: "remove", kind: "member", id });
    return true;
  }

  // ---- load cases ----

  /** Add a load case. If `label` is omitted, derives one from the type. */
  addLoadCase(opts?: { label?: string; type?: LoadCaseType }): LoadCase {
    const id = this.nextLoadCaseId++;
    const type = opts?.type ?? "dead";
    const label = opts?.label ?? this.suggestLoadCaseLabel(type);
    const lc: LoadCase = { id, label, type };
    this.loadCases.set(id, lc);
    this.emit({ reason: "add", kind: "loadCase", id });
    return lc;
  }

  /** Rename or retype a load case. */
  updateLoadCase(id: number, patch: Partial<Pick<LoadCase, "label" | "type">>): boolean {
    const lc = this.loadCases.get(id);
    if (!lc) return false;
    Object.assign(lc, patch);
    this.emit({ reason: "update", kind: "loadCase", id });
    return true;
  }

  /** Remove a load case; also drops every load + combo factor that used it. */
  removeLoadCase(id: number): boolean {
    const existed = this.loadCases.delete(id);
    if (!existed) return false;
    let loadsChanged = false;
    for (const [lid, load] of this.loads) {
      if (load.caseId === id) {
        this.loads.delete(lid);
        loadsChanged = true;
      }
    }
    let combosChanged = false;
    for (const combo of this.loadCombos.values()) {
      const before = combo.factors.length;
      combo.factors = combo.factors.filter((f) => f.caseId !== id);
      if (combo.factors.length !== before) combosChanged = true;
    }
    this.emit({ reason: "remove", kind: "loadCase", id });
    void loadsChanged;
    void combosChanged;
    return true;
  }

  /** Pick a unique default label for a new case of the given type (e.g. "DL2"). */
  private suggestLoadCaseLabel(type: LoadCaseType): string {
    const prefix = LOAD_CASE_LABEL_PREFIX[type];
    let n = 1;
    const taken = new Set([...this.loadCases.values()].map((c) => c.label));
    while (taken.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  }

  // ---- loads ----

  /** Add a load of any kind. */
  addLoad(load: LoadInput): BcadLoad | undefined {
    // Target entity must exist; case must exist.
    if (!this.loadCases.has(load.caseId)) return undefined;
    if (load.kind === "nodal") {
      if (!this.nodes.has(load.nodeId)) return undefined;
    } else {
      if (!this.members.has(load.memberId)) return undefined;
    }
    const id = this.nextLoadId++;
    const full = { ...load, id } as BcadLoad;
    this.loads.set(id, full);
    this.emit({ reason: "add", kind: "load", id });
    return full;
  }

  /**
   * Update mutable fields of a load. `patch` is merged onto the stored load; a
   * `caseId`/target change that points at a nonexistent entity is ignored.
   */
  updateLoad(id: number, patch: LoadPatch): boolean {
    const load = this.loads.get(id);
    if (!load) return false;
    const next = { ...load, ...patch } as BcadLoad;
    if (!this.loadCases.has(next.caseId)) return false;
    if (next.kind === "nodal") {
      if (!this.nodes.has(next.nodeId)) return false;
    } else {
      if (!this.members.has(next.memberId)) return false;
    }
    this.loads.set(id, next);
    this.emit({ reason: "update", kind: "load", id });
    return true;
  }

  /** Remove a single load. */
  removeLoad(id: number): boolean {
    const existed = this.loads.delete(id);
    if (!existed) return false;
    this.emit({ reason: "remove", kind: "load", id });
    return true;
  }

  /** Cascade: drop nodal loads attached to a node (called when node is removed). */
  private cascadeNodeLoads(nodeId: number): void {
    for (const [lid, load] of this.loads) {
      if (load.kind === "nodal" && load.nodeId === nodeId) this.loads.delete(lid);
    }
  }

  /** Cascade: drop member loads attached to a member (called when member is removed). */
  private cascadeMemberLoads(memberId: number): void {
    for (const [lid, load] of this.loads) {
      if (load.kind !== "nodal" && load.memberId === memberId) this.loads.delete(lid);
    }
  }

  // ---- load combinations ----

  /** Add a load combination. */
  addLoadCombo(opts?: { label?: string; factors?: LoadCombo["factors"] }): LoadCombo {
    const id = this.nextLoadComboId++;
    const label = opts?.label ?? this.suggestLoadComboLabel();
    const combo: LoadCombo = { id, label, factors: opts?.factors ?? [] };
    this.loadCombos.set(id, combo);
    this.emit({ reason: "add", kind: "loadCombo", id });
    return combo;
  }

  /** Rename or replace the factor list of a load combination. */
  updateLoadCombo(
    id: number,
    patch: Partial<Pick<LoadCombo, "label" | "factors">>
  ): boolean {
    const combo = this.loadCombos.get(id);
    if (!combo) return false;
    Object.assign(combo, patch);
    this.emit({ reason: "update", kind: "loadCombo", id });
    return true;
  }

  /** Remove a load combination. */
  removeLoadCombo(id: number): boolean {
    const existed = this.loadCombos.delete(id);
    if (!existed) return false;
    this.emit({ reason: "remove", kind: "loadCombo", id });
    return true;
  }

  /** Pick a unique default label for a new combination (e.g. "COMBO1"). */
  private suggestLoadComboLabel(): string {
    let n = 1;
    const taken = new Set([...this.loadCombos.values()].map((c) => c.label));
    while (taken.has(`COMBO${n}`)) n++;
    return `COMBO${n}`;
  }

  /** Remove a node or member depending on its kind. */
  removeSelection(kind: "node" | "member", id: number): void {
    if (kind === "node") this.removeNode(id);
    else this.removeMember(id);
  }

  /** Clear everything and reset id counters. */
  clear(): void {
    this.nodes.clear();
    this.members.clear();
    this.loadCases.clear();
    this.loads.clear();
    this.loadCombos.clear();
    this.nextNodeId = 1;
    this.nextMemberId = 1;
    this.nextLoadCaseId = 1;
    this.nextLoadId = 1;
    this.nextLoadComboId = 1;
    this.emit({ reason: "clear" });
  }

  // ---- snapshot ----

  snapshot(): ModelSnapshot {
    return {
      version: 1,
      nodes: this.allNodes(),
      members: this.allMembers(),
      nextNodeId: this.nextNodeId,
      nextMemberId: this.nextMemberId,
      loadCases: this.allLoadCases(),
      loads: this.allLoads(),
      loadCombos: this.allLoadCombos(),
      nextLoadCaseId: this.nextLoadCaseId,
      nextLoadId: this.nextLoadId,
      nextLoadComboId: this.nextLoadComboId,
      ubcParams: this.ubcParams,
      view: {
        projection: this.viewDefaults.projection,
        preset: this.viewDefaults.preset,
        draftPlane: this.viewDefaults.draftPlane,
        planeOffset: this.viewDefaults.planeOffset,
        snapEnabled: this.viewDefaults.snapEnabled,
        snapSpacing: this.viewDefaults.snapSpacing,
        showLabels: this.viewDefaults.showLabels,
        showGrid: this.viewDefaults.showGrid,
      },
    };
  }

  /** Replace model contents from a snapshot (used by Open). */
  load(snap: ModelSnapshot): void {
    this.nodes.clear();
    this.members.clear();
    this.loadCases.clear();
    this.loads.clear();
    this.loadCombos.clear();
    for (const n of snap.nodes) this.nodes.set(n.id, { ...n });
    for (const m of snap.members) {
      // Backfill tag for snapshots saved before the tag field existed.
      this.members.set(m.id, { ...m, tag: m.tag ?? "none" });
    }
    this.nextNodeId = snap.nextNodeId ?? snap.nodes.length + 1;
    this.nextMemberId = snap.nextMemberId ?? snap.members.length + 1;
    // Load domain is optional so older project files still open cleanly.
    for (const lc of snap.loadCases ?? []) this.loadCases.set(lc.id, { ...lc });
    for (const ld of snap.loads ?? []) this.loads.set(ld.id, { ...ld });
    for (const cb of snap.loadCombos ?? []) {
      this.loadCombos.set(cb.id, { ...cb, factors: cb.factors.map((f) => ({ ...f })) });
    }
    this.nextLoadCaseId = snap.nextLoadCaseId ?? this.loadCases.size + 1;
    this.nextLoadId = snap.nextLoadId ?? this.loads.size + 1;
    this.nextLoadComboId = snap.nextLoadComboId ?? this.loadCombos.size + 1;
    this.ubcParams = snap.ubcParams ?? undefined;
    this.viewDefaults = {
      projection: snap.view?.projection ?? "3d",
      preset: snap.view?.preset ?? "iso",
      draftPlane: snap.view?.draftPlane ?? "xy",
      planeOffset: (snap.view as Record<string, unknown>)?.planeOffset as number ?? 0,
      snapEnabled: snap.view?.snapEnabled ?? true,
      snapSpacing: snap.view?.snapSpacing ?? 1,
      showLabels: snap.view?.showLabels ?? true,
      showGrid: snap.view?.showGrid ?? true,
    };
    this.emit({ reason: "load" });
  }

  /** UBC seismic parameters (from .std import). */
  ubcParams?: UbcParams;

  /** Last-known view settings; updated by App so save() captures them. */
  viewDefaults: {
    projection: ProjectionMode;
    preset: ViewPreset;
    draftPlane: DraftPlane;
    planeOffset: number;
    snapEnabled: boolean;
    snapSpacing: number;
    showLabels: boolean;
    showGrid: boolean;
  } = {
    projection: "3d",
    preset: "iso",
    draftPlane: "xy",
    planeOffset: 0,
    snapEnabled: true,
    snapSpacing: 1,
    showLabels: true,
    showGrid: true,
  };
}

/** Short label prefix per load-case type, for suggested labels (DL, LL, WL…). */
const LOAD_CASE_LABEL_PREFIX: Record<LoadCaseType, string> = {
  dead: "DL",
  live: "LL",
  wind: "WL",
  snow: "SL",
  quake: "QL",
  temperature: "TL",
  other: "LC",
};

/**
 * A load without its id — for creating new loads. Omit must distribute over the
 * union so each variant keeps its own fields (nodeId for nodal, memberId…).
 */
export type LoadInput = DistributiveOmit<BcadLoad, "id">;

/** A partial load patch for updates. Also distributive so per-variant fields type-check. */
export type LoadPatch = DistributiveOmit<Partial<BcadLoad>, "kind"> & { kind?: BcadLoad["kind"] };

/** Omit that distributes over a union of object types (so member fields survive). */
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
