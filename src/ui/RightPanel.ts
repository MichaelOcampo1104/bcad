import { el } from "./helpers";
import type { Model } from "../model/Model";
import type {
  MemberTag,
  Selection,
  SelectionSet,
  NodeFixity,
  MemberFixity,
  MemberEndRelease,
  NodeFixityPreset,
} from "../types";
import {
  MEMBER_TAGS,
  selKey,
  NODE_FIXITY_PRESETS,
  makeNodeFixity,
  detectNodeFixityPreset,
  MATERIAL_TYPES,
  SECTION_SHAPES,
  memberEndReleaseFixed,
} from "../types";
import type { MaterialType, SectionShape } from "../types";

export interface RightPanelCallbacks {
  /** Replace the selection with the given set (plain click in tree). */
  onSelect: (set: SelectionSet) => void;
  /** Toggle a single entity in/out of the selection (Ctrl+click in tree). */
  onToggleSelect: (sel: Selection) => void;
  onClearSelection: () => void;
  onEditNode: (id: number, patch: { label?: string; x?: number; y?: number; z?: number; weight?: number }) => void;
  onEditMember: (id: number, patch: { label?: string; tag?: MemberTag; materialGrade?: string; sectionProps?: string; beta?: number }) => void;
  /** Apply one tag to every selected member (bulk edit). */
  onBulkTag: (tag: MemberTag) => void;
  /** Set the fixity (restraints) on a single node. */
  onEditNodeFixity: (id: number, fixity: NodeFixity) => void;
  /** Set the end fixity on a single member. */
  onEditMemberFixity: (id: number, fixity: MemberFixity) => void;
  /** Apply one fixity preset to every selected node. */
  onBulkNodeFixity: (fixity: NodeFixity) => void;
  /** Apply one end-fixity pair to every selected member. */
  onBulkMemberFixity: (fixity: MemberFixity) => void;
  /** Set the material on a single member. */
  onEditMemberMaterial: (id: number, material: MaterialType) => void;
  /** Set the section shape on a single member. */
  onEditMemberSection: (id: number, section: SectionShape) => void;
  /** Apply one material to every selected member. */
  onBulkMaterial: (material: MaterialType) => void;
  /** Apply one section shape to every selected member. */
  onBulkSection: (section: SectionShape) => void;
}

/**
 * Right panel: Properties (selected entity/entities) + Model Tree (nodes/members).
 * Reads from the Model for the tree; reflects the live selection for props.
 *
 * Properties adapts to selection size:
 *  - 0 selected  → "Nothing selected"
 *  - 1 selected  → full editable form (label, coords/length, tag)
 *  - >1 selected → summary header ("N nodes, M members") + a bulk Tag editor
 *                  that applies one tag to all selected members, + a Clear button
 */
export class RightPanel {
  readonly node: HTMLElement;
  private propsEl: HTMLElement;
  private nodesListEl: HTMLElement;
  private membersListEl: HTMLElement;

  constructor(
    private readonly model: Model,
    private readonly cb: RightPanelCallbacks
  ) {
    this.node = el("aside", "right-panel");

    // Fixed-top section: Properties — scrolls independently if tall.
    const propsSection = el("div", "rp-props-section");
    const propsTitle = el("div", "panel-title", "Properties");
    this.propsEl = el("div", "props");
    propsSection.append(propsTitle, this.propsEl);

    // Flex-bottom section: Model Tree — fills remaining space.
    const treeSection = el("div", "rp-tree-section");
    const treeTitle = el("div", "panel-title", "Model Tree");
    const tree = el("div", "tree");
    this.nodesListEl = el("div", "tree-list");
    this.membersListEl = el("div", "tree-list");
    tree.append(el("div", "tree-sub", "Nodes"), this.nodesListEl);
    tree.append(el("div", "tree-sub", "Members"), this.membersListEl);
    treeSection.append(treeTitle, tree);

    this.node.append(propsSection, treeSection);
  }

  /** Full refresh of properties + tree. Called on any model/selection change. */
  refresh(selection: SelectionSet): void {
    this.renderProps(selection);
    this.renderTree(selection);
  }

  private renderProps(sel: SelectionSet): void {
    this.propsEl.replaceChildren();
    if (sel.length === 0) {
      const empty = el("div", "props-empty");
      empty.append(
        el("div", "props-empty-icon", "◈"),
        el("div", "props-empty-msg", "Select a node or member"),
        el("div", "props-empty-hint", "Click in the 3D view or in the Model Tree below")
      );
      this.propsEl.append(empty);
      return;
    }
    if (sel.length === 1) {
      this.renderSingleProps(sel[0]);
      return;
    }
    this.renderMultiProps(sel);
  }

  /** Full editable form for the single selected entity. */
  private renderSingleProps(s: Selection): void {
    if (s.kind === "node") {
      const n = this.model.getNode(s.id);
      if (!n) return;
      this.propsEl.append(
        this.row("Kind", "Node"),
        this.field("Label", n.label, (v) => this.cb.onEditNode(n.id, { label: v })),
        this.numField("X", n.x, (v) => this.cb.onEditNode(n.id, { x: v })),
        this.numField("Y", n.y, (v) => this.cb.onEditNode(n.id, { y: v })),
        this.numField("Z", n.z, (v) => this.cb.onEditNode(n.id, { z: v })),
        this.numField("Weight", n.weight, (v) => this.cb.onEditNode(n.id, { weight: v }))
      );
      this.propsEl.append(this.renderNodeFixity(n.id, n.fixity));
    } else {
      const m = this.model.getMember(s.id);
      if (!m) return;
      const a = this.model.getNode(m.nodeAId);
      const b = this.model.getNode(m.nodeBId);
      const len =
        a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z).toFixed(3) : "—";
      this.propsEl.append(
        this.row("Kind", "Member"),
        this.field("Label", m.label, (v) => this.cb.onEditMember(m.id, { label: v })),
        this.row("Node A", m.nodeAId.toString()),
        this.row("Node B", m.nodeBId.toString()),
        this.row("Length", len),
        this.tagField("Tag", m.tag, (v) => this.cb.onEditMember(m.id, { tag: v }))
      );
      this.propsEl.append(
        this.renderMemberFixity(m.id, m.fixity),
        this.renderMemberProperties(m.id, m.material, m.section, m.materialGrade, m.beta, m.sectionProps)
      );
    }
  }

  /** Summary + bulk tag editor for a multi-selection. */
  private renderMultiProps(sel: SelectionSet): void {
    const nodeCount = sel.filter((s) => s.kind === "node").length;
    const memberCount = sel.length - nodeCount;

    const summary = el("div", "props-summary");
    const head = el("div", "props-summary-head", `${sel.length} selected`);
    const detail = el(
      "div",
      "props-summary-detail",
      `${nodeCount} node${nodeCount !== 1 ? "s" : ""}, ${memberCount} member${memberCount !== 1 ? "s" : ""}`
    );
    summary.append(head, detail);

    if (memberCount > 0) {
      // Bulk tag editor: applying a tag touches every selected member.
      const tagRow = el("div", "prop-row");
      tagRow.append(el("span", "prop-key", "Tag all"));
      const select = document.createElement("select");
      select.className = "prop-input";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "— leave unchanged —";
      select.appendChild(placeholder);
      for (const t of MEMBER_TAGS) {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        select.appendChild(o);
      }
      select.addEventListener("change", () => {
        if (select.value) this.cb.onBulkTag(select.value as MemberTag);
        select.value = "";
      });
      tagRow.append(select);
      summary.append(tagRow);
    }

    // Bulk node fixity
    if (nodeCount > 0) {
      summary.append(this.renderBulkNodeFixity());
    }

    // Bulk member fixity
    if (memberCount > 0) {
      summary.append(this.renderBulkMemberFixity());
      summary.append(this.renderBulkMaterial());
      summary.append(this.renderBulkSection());
    }

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear selection";
    clearBtn.className = "props-clear-btn";
    clearBtn.addEventListener("click", () => this.cb.onClearSelection());

    this.propsEl.append(summary, clearBtn);
  }

  private renderTree(sel: SelectionSet): void {
    this.nodesListEl.replaceChildren();
    this.membersListEl.replaceChildren();
    const keys = new Set(sel.map(selKey));

    const nodes = this.model.allNodes();
    if (nodes.length === 0) this.nodesListEl.append(el("div", "tree-empty", "No nodes"));
    for (const n of nodes) {
      const row = el("div", "tree-item");
      if (keys.has(`node:${n.id}`)) row.classList.add("selected");
      const label = el("span", "tree-label", n.label);
      const coords = el("span", "tree-coords", `(${fmt(n.x)}, ${fmt(n.y)}, ${fmt(n.z)})`);
      row.append(label, coords);
      this.bindTreeClick(row, { kind: "node", id: n.id });
      this.nodesListEl.appendChild(row);
    }

    const members = this.model.allMembers();
    if (members.length === 0) this.membersListEl.append(el("div", "tree-empty", "No members"));
    for (const m of members) {
      const row = el("div", "tree-item");
      if (keys.has(`member:${m.id}`)) row.classList.add("selected");
      const label = el("span", "tree-label", m.label);
      const ends = el("span", "tree-coords", `${m.nodeAId} → ${m.nodeBId}`);
      row.append(label, ends);
      this.bindTreeClick(row, { kind: "member", id: m.id });
      this.membersListEl.appendChild(row);
    }
  }

  /** Plain click selects only this entity; Ctrl/Cmd+click toggles it. */
  private bindTreeClick(row: HTMLElement, sel: Selection): void {
    row.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) this.cb.onToggleSelect(sel);
      else this.cb.onSelect([sel]);
    });
  }

  // ---- fixity rendering ----

  /** Section divider + label for fixity controls. */
  private fixityLabel(text: string): HTMLElement {
    return el("div", "fixity-label", text);
  }

  /** Render node fixity: preset dropdown, and a DOF toggle grid when custom. */
  private renderNodeFixity(id: number, fixity: NodeFixity | undefined): HTMLElement {
    const wrap = el("div", "fixity-section");
    wrap.append(this.fixityLabel("Fixity"));

    const current = fixity ?? makeNodeFixity("free");
    const preset = detectNodeFixityPreset(current);

    // Preset dropdown
    const sel = document.createElement("select");
    sel.className = "prop-input";
    for (const p of NODE_FIXITY_PRESETS) {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p.charAt(0).toUpperCase() + p.slice(1);
      if (p === preset) o.selected = true;
      sel.appendChild(o);
    }
    // "custom" option
    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "Custom";
    if (preset === "custom") customOpt.selected = true;
    sel.appendChild(customOpt);

    // DOF toggle grid (only visible when custom)
    const dofGrid = el("div", "dof-grid");
    const dofEls = this.buildDofToggles(current, (newFixity) => {
      this.cb.onEditNodeFixity(id, newFixity);
    });

    const showCustom = preset === "custom";
    dofGrid.style.display = showCustom ? "" : "none";
    dofGrid.append(...dofEls);

    sel.addEventListener("change", () => {
      const val = sel.value as NodeFixityPreset;
      if (val === "custom") {
        dofGrid.style.display = "";
        // Keep current DOF state, don't overwrite
      } else {
        dofGrid.style.display = "none";
        this.cb.onEditNodeFixity(id, makeNodeFixity(val));
      }
    });

    wrap.append(sel, dofGrid);
    return wrap;
  }

  /** Build the 6 DOF toggle buttons. Returns an array of DOM elements. */
  private buildDofToggles(
    fixity: NodeFixity,
    onChange: (f: NodeFixity) => void
  ): HTMLElement[] {
    const dofs: { key: keyof NodeFixity; label: string }[] = [
      { key: "tx", label: "Tx" },
      { key: "ty", label: "Ty" },
      { key: "tz", label: "Tz" },
      { key: "rx", label: "Rx" },
      { key: "ry", label: "Ry" },
      { key: "rz", label: "Rz" },
    ];

    return dofs.map(({ key, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dof-btn";
      btn.textContent = label;
      if (fixity[key] === "fixed") btn.classList.add("active");
      btn.addEventListener("click", () => {
        const next: NodeFixity = { ...fixity, [key]: fixity[key] === "fixed" ? "free" : "fixed" };
        onChange(next);
      });
      return btn;
    });
  }

  /** Render member end fixity: MX/MY/MZ toggle grids per end. */
  private renderMemberFixity(id: number, fixity: MemberFixity | undefined): HTMLElement {
    const wrap = el("div", "fixity-section");
    wrap.append(this.fixityLabel("End Fixity"));

    const row = el("div", "fixity-row");

    // Start end
    const startWrap = el("div", "fixity-end");
    startWrap.append(el("span", "fixity-end-label", "Start"));
    startWrap.append(this.buildMemberEndReleaseToggles(
      fixity?.start ?? memberEndReleaseFixed(),
      (r) => this.cb.onEditMemberFixity(id, { start: r, end: fixity?.end ?? memberEndReleaseFixed() })
    ));

    // End end
    const endWrap = el("div", "fixity-end");
    endWrap.append(el("span", "fixity-end-label", "End"));
    endWrap.append(this.buildMemberEndReleaseToggles(
      fixity?.end ?? memberEndReleaseFixed(),
      (r) => this.cb.onEditMemberFixity(id, { start: fixity?.start ?? memberEndReleaseFixed(), end: r })
    ));

    row.append(startWrap, endWrap);
    wrap.append(row);
    return wrap;
  }

  /** Build a 3-button MX/MY/MZ toggle grid for a member end release. */
  private buildMemberEndReleaseToggles(
    release: MemberEndRelease,
    onChange: (r: MemberEndRelease) => void
  ): HTMLElement {
    const grid = el("div", "dof-grid");
    const dofs: { key: "mx" | "my" | "mz"; label: string }[] = [
      { key: "mx", label: "MX" },
      { key: "my", label: "MY" },
      { key: "mz", label: "MZ" },
    ];
    for (const { key, label } of dofs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dof-btn";
      btn.textContent = label;
      if (release[key]) btn.classList.add("active");
      btn.addEventListener("click", () => {
        onChange({ ...release, [key]: !release[key] });
      });
      grid.appendChild(btn);
    }
    return grid;
  }

  /** Render material + section dropdowns for a single member. */
  private renderMemberProperties(
    id: number,
    material: MaterialType | undefined,
    section: SectionShape | undefined,
    materialGrade?: string,
    beta?: number,
    sectionProps?: string
  ): HTMLElement {
    const wrap = el("div", "fixity-section");
    wrap.append(this.fixityLabel("Properties"));

    // Material
    const matRow = el("div", "prop-row");
    matRow.append(el("span", "prop-key", "Material"));
    const matSel = document.createElement("select");
    matSel.className = "prop-input";
    for (const m of MATERIAL_TYPES) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m.charAt(0).toUpperCase() + m.slice(1);
      if (m === (material ?? "steel")) o.selected = true;
      matSel.appendChild(o);
    }
    matSel.addEventListener("change", () => {
      this.cb.onEditMemberMaterial(id, matSel.value as MaterialType);
    });
    matRow.append(matSel);

    // Material grade (free text)
    const gradeRow = el("div", "prop-row");
    gradeRow.append(el("span", "prop-key", "Grade"));
    const gradeInput = document.createElement("input");
    gradeInput.type = "text";
    gradeInput.className = "prop-input";
    gradeInput.value = materialGrade ?? "";
    gradeInput.placeholder = "e.g. C25/30, S275";
    gradeInput.addEventListener("change", () =>
      this.cb.onEditMember(id, { materialGrade: gradeInput.value.trim() || undefined })
    );
    gradeRow.append(gradeInput);

    // Section
    const secRow = el("div", "prop-row");
    secRow.append(el("span", "prop-key", "Section"));
    const secSel = document.createElement("select");
    secSel.className = "prop-input";
    for (const s of SECTION_SHAPES) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (s === (section ?? "rectangular")) o.selected = true;
      secSel.appendChild(o);
    }
    secSel.addEventListener("change", () => {
      this.cb.onEditMemberSection(id, secSel.value as SectionShape);
    });
    secRow.append(secSel);

    // Section props (dimensions/profile/params) — context-sensitive input
    const propsRow = el("div", "prop-row");
    const propsLabel = section === "rectangular" ? "YD / ZD" : "Profile";
    propsRow.append(el("span", "prop-key", propsLabel));
    const propsInput = document.createElement("input");
    propsInput.type = "text";
    propsInput.className = "prop-input";
    propsInput.value = sectionProps ?? "";
    const placeholders: Record<string, string> = {
      rectangular: "YD 0.3 ZD 0.3",
      i_beam: "UC152X152X30",
      hss_round: "OD 0.168 WT 0.007",
      hss_rect: "OD 0.15 WT 0.006",
      channel: "C 200X75",
      angle: "L 65X65X6",
    };
    propsInput.placeholder = placeholders[section ?? ""] ?? "dimensions";
    propsInput.addEventListener("change", () =>
      this.cb.onEditMember(id, { sectionProps: propsInput.value.trim() || undefined })
    );
    propsRow.append(propsInput);

    // Beta angle
    const betaRow = el("div", "prop-row");
    betaRow.append(el("span", "prop-key", "Beta"));
    const betaInput = document.createElement("input");
    betaInput.type = "number";
    betaInput.step = "any";
    betaInput.className = "prop-input";
    betaInput.value = beta != null ? String(beta) : "";
    betaInput.placeholder = "deg";
    betaInput.addEventListener("change", () => {
      const v = parseFloat(betaInput.value);
      this.cb.onEditMember(id, { beta: Number.isFinite(v) ? v : undefined });
    });
    betaRow.append(betaInput);

    wrap.append(matRow, gradeRow, secRow, propsRow, betaRow);
    return wrap;
  }

  /** Bulk node fixity preset dropdown. */
  private renderBulkNodeFixity(): HTMLElement {
    const row = el("div", "prop-row");
    row.append(el("span", "prop-key", "Fixity nodes"));

    const select = document.createElement("select");
    select.className = "prop-input";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— leave unchanged —";
    select.appendChild(placeholder);
    for (const p of NODE_FIXITY_PRESETS) {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p.charAt(0).toUpperCase() + p.slice(1);
      select.appendChild(o);
    }
    select.addEventListener("change", () => {
      if (select.value) {
        this.cb.onBulkNodeFixity(makeNodeFixity(select.value as NodeFixityPreset));
      }
      select.value = "";
    });
    row.append(select);
    return row;
  }

  /** Bulk member end fixity: MX/MY/MZ toggle grids + Apply. */
  private renderBulkMemberFixity(): HTMLElement {
    const wrap = el("div", "prop-row");
    wrap.append(el("span", "prop-key", "Fixity members"));

    // Mutable state updated by toggle clicks, read on Apply.
    const startState = memberEndReleaseFixed();
    const endState = memberEndReleaseFixed();

    // Start
    const startWrap = el("div", "fixity-end");
    startWrap.append(el("span", "fixity-end-label", "Start"));
    startWrap.append(this.buildBulkReleaseToggles(startState));

    // End
    const endWrap = el("div", "fixity-end");
    endWrap.append(el("span", "fixity-end-label", "End"));
    endWrap.append(this.buildBulkReleaseToggles(endState));

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";
    applyBtn.className = "fixity-apply-btn";
    applyBtn.addEventListener("click", () => {
      this.cb.onBulkMemberFixity({
        start: { ...startState },
        end: { ...endState },
      });
    });

    const row = el("div", "fixity-bulk-row");
    row.append(startWrap, endWrap, applyBtn);
    wrap.append(row);
    return wrap;
  }

  /** Self-toggling MX/MY/MZ buttons for bulk — mutates `release` in place. */
  private buildBulkReleaseToggles(release: MemberEndRelease): HTMLElement {
    const grid = el("div", "dof-grid");
    const entries: { key: "mx" | "my" | "mz"; label: string }[] = [
      { key: "mx", label: "MX" },
      { key: "my", label: "MY" },
      { key: "mz", label: "MZ" },
    ];
    for (const { key, label } of entries) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dof-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        release[key] = !release[key];
        btn.classList.toggle("active");
      });
      grid.appendChild(btn);
    }
    return grid;
  }

  /** Bulk material dropdown. */
  private renderBulkMaterial(): HTMLElement {
    const row = el("div", "prop-row");
    row.append(el("span", "prop-key", "Material"));

    const select = document.createElement("select");
    select.className = "prop-input";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— leave unchanged —";
    select.appendChild(placeholder);
    for (const m of MATERIAL_TYPES) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m.charAt(0).toUpperCase() + m.slice(1);
      select.appendChild(o);
    }
    select.addEventListener("change", () => {
      if (select.value) this.cb.onBulkMaterial(select.value as MaterialType);
      select.value = "";
    });
    row.append(select);
    return row;
  }

  /** Bulk section shape dropdown. */
  private renderBulkSection(): HTMLElement {
    const row = el("div", "prop-row");
    row.append(el("span", "prop-key", "Section"));

    const select = document.createElement("select");
    select.className = "prop-input";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— leave unchanged —";
    select.appendChild(placeholder);
    for (const s of SECTION_SHAPES) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      select.appendChild(o);
    }
    select.addEventListener("change", () => {
      if (select.value) this.cb.onBulkSection(select.value as SectionShape);
      select.value = "";
    });
    row.append(select);
    return row;
  }

  // ---- generic form helpers ----

  private row(key: string, value: string): HTMLElement {
    const r = el("div", "prop-row");
    r.append(el("span", "prop-key", key), el("span", "prop-val", value));
    return r;
  }

  private field(key: string, value: string, onChange: (v: string) => void): HTMLElement {
    const r = el("div", "prop-row");
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.className = "prop-input";
    input.addEventListener("change", () => onChange(input.value.trim()));
    r.append(el("span", "prop-key", key), input);
    return r;
  }

  private numField(key: string, value: number | undefined, onChange: (v: number) => void): HTMLElement {
    const r = el("div", "prop-row");
    const input = document.createElement("input");
    input.type = "number";
    input.value = value != null ? String(value) : "";
    input.step = "any";
    input.className = "prop-input";
    input.placeholder = value != null ? "" : "—";
    input.addEventListener("change", () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) onChange(v);
    });
    r.append(el("span", "prop-key", key), input);
    return r;
  }

  private tagField(
    key: string,
    value: MemberTag,
    onChange: (v: MemberTag) => void
  ): HTMLElement {
    const r = el("div", "prop-row");
    const sel = document.createElement("select");
    sel.className = "prop-input";
    for (const t of MEMBER_TAGS) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      if (t === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => onChange(sel.value as MemberTag));
    r.append(el("span", "prop-key", key), sel);
    return r;
  }
}

function fmt(n: number): string {
  return parseFloat(n.toFixed(3)).toString();
}
