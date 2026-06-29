import type {
  BcadMember,
  BcadNode,
  ModelChangeEvent,
  ModelSnapshot,
  ProjectionMode,
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
  private nextNodeId = 1;
  private nextMemberId = 1;

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

  // ---- mutations ----

  /**
   * Add a node at a coordinate. If a node already exists at that exact spot,
   * reuse it (snap/dedup). Returns the resulting node (created or existing).
   */
  addNode(x: number, y: number, z: number, label?: string): BcadNode {
    const existing = this.findNodeAt(x, y, z);
    if (existing) return existing;

    const id = this.nextNodeId++;
    const node: BcadNode = {
      id,
      label: label ?? `N${id}`,
      x,
      y,
      z,
    };
    this.nodes.set(id, node);
    this.emit({ reason: "add", kind: "node", id });
    return node;
  }

  /** Update a node's coordinates and/or label. */
  updateNode(id: number, patch: Partial<Pick<BcadNode, "x" | "y" | "z" | "label">>): boolean {
    const n = this.nodes.get(id);
    if (!n) return false;
    Object.assign(n, patch);
    this.emit({ reason: "update", kind: "node", id });
    return true;
  }

  /**
   * Add a member between two node ids. If both endpoints resolve to the same
   * node, refuses (zero-length) and returns undefined. Dedupes duplicates.
   */
  addMember(nodeAId: number, nodeBId: number, label?: string): BcadMember | undefined {
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
      label: label ?? `M${id}`,
      nodeAId,
      nodeBId,
    };
    this.members.set(id, member);
    this.emit({ reason: "add", kind: "member", id });
    return member;
  }

  /** Update a member's label or endpoints. */
  updateMember(
    id: number,
    patch: Partial<Pick<BcadMember, "label" | "nodeAId" | "nodeBId">>
  ): boolean {
    const m = this.members.get(id);
    if (!m) return false;
    Object.assign(m, patch);
    this.emit({ reason: "update", kind: "member", id });
    return true;
  }

  /** Remove a node; also removes every member that referenced it. */
  removeNode(id: number): boolean {
    const existed = this.nodes.delete(id);
    if (!existed) return false;
    for (const m of this.membersAtNode(id)) {
      this.members.delete(m.id);
    }
    this.emit({ reason: "remove" });
    return true;
  }

  /** Remove a member only (keeps its nodes). */
  removeMember(id: number): boolean {
    const existed = this.members.delete(id);
    if (!existed) return false;
    this.emit({ reason: "remove", kind: "member", id });
    return true;
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
    this.nextNodeId = 1;
    this.nextMemberId = 1;
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
      view: {
        // view settings live in App; Model stores last-known defaults here
        projection: this.viewDefaults.projection,
        preset: this.viewDefaults.preset,
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
    for (const n of snap.nodes) this.nodes.set(n.id, { ...n });
    for (const m of snap.members) this.members.set(m.id, { ...m });
    this.nextNodeId = snap.nextNodeId ?? snap.nodes.length + 1;
    this.nextMemberId = snap.nextMemberId ?? snap.members.length + 1;
    this.viewDefaults = {
      projection: snap.view?.projection ?? "3d",
      preset: snap.view?.preset ?? "iso",
      snapEnabled: snap.view?.snapEnabled ?? true,
      snapSpacing: snap.view?.snapSpacing ?? 1,
      showLabels: snap.view?.showLabels ?? true,
      showGrid: snap.view?.showGrid ?? true,
    };
    this.emit({ reason: "load" });
  }

  /** Last-known view settings; updated by App so save() captures them. */
  viewDefaults: {
    projection: ProjectionMode;
    preset: ViewPreset;
    snapEnabled: boolean;
    snapSpacing: number;
    showLabels: boolean;
    showGrid: boolean;
  } = {
    projection: "3d",
    preset: "iso",
    snapEnabled: true,
    snapSpacing: 1,
    showLabels: true,
    showGrid: true,
  };
}
