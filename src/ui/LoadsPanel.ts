import { el } from "./helpers";
import type { Model, LoadInput, LoadPatch } from "../model/Model";
import type {
  BcadLoad,
  LoadCaseType,
  LoadDirection,
  LoadKind,
} from "../types";
import { LOAD_CASE_TYPES } from "../types";

/**
 * Loads management panel. Self-contained + Model-driven (same reactive
 * pattern as NodeGrid/MemberGrid): subscribes to model changes and re-renders.
 *
 * Layout (stacked vertically so it fits the ~200px left rail):
 *   - Load-case bar: a dropdown to pick the active case (filters the table),
 *     plus Add / Rename / Retype / Delete case affordances.
 *   - Loads table: one compact row per load in the active case (or all). Short
 *     type badge, target entity, magnitude summary. Click to select + edit.
 *   - Inline editor for the selected load: adapts to its kind.
 *   - + Add load (Nodal / Member point / Member distributed).
 */
export class LoadsPanel {
  readonly node: HTMLElement;
  private caseBar: HTMLElement;
  private caseSelect: HTMLSelectElement;
  private tableBody: HTMLElement;
  private footer: HTMLElement;
  private editorEl: HTMLElement;
  private addMenu: HTMLElement;

  /** Active case filter: 0 = all cases. */
  private activeCaseId = 0;
  /** The load currently shown in the inline editor, or null. */
  private selectedLoadId: number | null = null;
  /** Quick rename / retype sub-panel, hidden by default. */
  private caseMgrOpen = false;
  /** Member IDs selected in the viewport/tree (for bulk apply). */
  private selectedMembers: number[] = [];

  constructor(private readonly model: Model) {
    this.node = el("div", "loads-panel");

    // ---- Load-case bar ----
    this.caseBar = el("div", "load-case-bar");
    this.caseSelect = document.createElement("select");
    this.caseSelect.className = "prop-input";
    this.caseSelect.title = "Filter loads by case";
    this.caseSelect.addEventListener("change", () => {
      this.activeCaseId = Number(this.caseSelect.value);
      this.renderTable();
      this.renderEditor();
    });
    const caseAdd = el("button", "lc-mini-btn", "+ Case");
    caseAdd.type = "button";
    caseAdd.title = "Add a load case";
    caseAdd.addEventListener("click", () => this.onAddCase());
    const caseMgr = el("button", "lc-mini-btn", "Manage");
    caseMgr.type = "button";
    caseMgr.title = "Rename / retype / delete a case";
    caseMgr.addEventListener("click", () => {
      this.caseMgrOpen = !this.caseMgrOpen;
      this.reconcile();
    });
    this.caseBar.append(this.caseSelect, caseAdd, caseMgr);

    // ---- Loads table ----
    const tableHead = el("div", "grid-row grid-head");
    tableHead.append(
      el("span", "grid-cell grid-num", "#"),
      el("span", "grid-cell ld-type-col", "Type"),
      el("span", "grid-cell ld-tgt-col", "Target"),
      el("span", "grid-cell", "Magnitude")
    );
    this.tableBody = el("div", "grid-body ld-body");
    this.footer = el("div", "grid-foot", "0 loads");

    const tableWrap = el("div", "loads-table");
    tableWrap.append(tableHead, this.tableBody, this.footer);

    // ---- Inline editor ----
    this.editorEl = el("div", "load-editor");

    // ---- Add-load menu ----
    this.addMenu = el("div", "load-add-menu");
    for (const k of LOAD_KINDS) {
      const b = el("button", "lc-add-btn", `+ ${LOAD_KIND_LABEL[k]}`);
      b.type = "button";
      b.addEventListener("click", () => this.onAddLoad(k));
      this.addMenu.appendChild(b);
    }

    this.node.append(this.caseBar, this.renderCaseManager(), tableWrap, this.editorEl, this.addMenu);

    model.on(() => this.reconcile());
    this.reconcile();
  }

  /** Full reconcile: case dropdown + table + editor. Called on any change. */
  private reconcile(): void {
    this.renderCaseBar();
    this.renderCaseManager();
    this.renderTable();
    this.renderEditor();
  }

  // ---- case bar ----

  private renderCaseBar(): void {
    const prev = this.activeCaseId;
    this.caseSelect.replaceChildren();

    const all = document.createElement("option");
    all.value = "0";
    all.textContent = "All cases";
    this.caseSelect.appendChild(all);

    for (const lc of this.model.allLoadCases()) {
      const o = document.createElement("option");
      o.value = String(lc.id);
      o.textContent = `${lc.label} (${lc.type})`;
      if (lc.id === prev) o.selected = true;
      this.caseSelect.appendChild(o);
    }
    // If the active case got deleted, fall back to "all".
    if (prev !== 0 && !this.model.getLoadCase(prev)) this.activeCaseId = 0;
    this.caseSelect.value = String(this.activeCaseId);
  }

  /** Collapsible per-case rename / retype / delete block. */
  private renderCaseManager(): HTMLElement {
    this.caseMgrWrap ??= el("div", "load-case-mgr");
    this.caseMgrWrap.replaceChildren();
    this.caseMgrWrap.style.display = this.caseMgrOpen ? "" : "none";
    if (!this.caseMgrOpen) return this.caseMgrWrap;

    const cases = this.model.allLoadCases();
    if (cases.length === 0) {
      this.caseMgrWrap.append(el("div", "ld-empty", "No load cases yet."));
      return this.caseMgrWrap;
    }
    for (const lc of cases) {
      const row = el("div", "lcm-row");
      const name = document.createElement("input");
      name.type = "text";
      name.className = "prop-input";
      name.value = lc.label;
      name.title = "Case label";
      name.addEventListener("change", () =>
        this.model.updateLoadCase(lc.id, { label: name.value.trim() || lc.label })
      );

      const type = document.createElement("select");
      type.className = "prop-input";
      for (const t of LOAD_CASE_TYPES) {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        if (t === lc.type) o.selected = true;
        type.appendChild(o);
      }
      type.addEventListener("change", () =>
        this.model.updateLoadCase(lc.id, { type: type.value as LoadCaseType })
      );

      const del = el("button", "grid-del", "×");
      del.type = "button";
      del.title = "Delete case (and its loads)";
      del.addEventListener("click", () => {
        if (confirm(`Delete case "${lc.label}" and all its loads?`)) {
          this.model.removeLoadCase(lc.id);
        }
      });
      row.append(name, type, del);
      this.caseMgrWrap.append(row);
    }
    return this.caseMgrWrap;
  }
  private caseMgrWrap!: HTMLElement;

  // ---- table ----

  private renderTable(): void {
    this.tableBody.replaceChildren();
    const loads = this.model.allLoads().filter(
      (l) => this.activeCaseId === 0 || l.caseId === this.activeCaseId
    );

    if (loads.length === 0) {
      this.tableBody.append(el("div", "ld-empty", "No loads. Use + below."));
    }
    for (let i = 0; i < loads.length; i++) {
      const ld = loads[i];
      const row = el("div", "grid-row ld-row");
      if (ld.id === this.selectedLoadId) row.classList.add("selected");
      row.addEventListener("click", () => {
        this.selectedLoadId = ld.id;
        this.renderTable();
        this.renderEditor();
      });

      const numWrap = el("span", "grid-cell grid-num");
      numWrap.append(el("span", "grid-num-text", String(i + 1)));
      const del = el("button", "grid-del", "×");
      del.type = "button";
      del.tabIndex = -1;
      del.title = "Delete load";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.model.removeLoad(ld.id);
        if (this.selectedLoadId === ld.id) this.selectedLoadId = null;
      });
      numWrap.append(del);

      const badge = el("span", `grid-cell ld-type-badge ${ld.kind}`, LOAD_KIND_BADGE[ld.kind]);
      const tgt = el("span", "grid-cell ld-tgt", loadTargetLabel(ld));
      const mag = el("span", "grid-cell ld-mag", loadMagSummary(ld));

      row.append(numWrap, badge, tgt, mag);
      this.tableBody.append(row);
    }
    this.footer.textContent = `${loads.length} load${loads.length === 1 ? "" : "s"}`;
  }

  // ---- inline editor ----

  private renderEditor(): void {
    this.editorEl.replaceChildren();
    const ld = this.selectedLoadId != null ? this.model.getLoad(this.selectedLoadId) : undefined;
    if (!ld) {
      this.editorEl.append(el("div", "ld-empty", "Select a load to edit it."));
      return;
    }

    // Shared header: case + direction.
    this.editorEl.append(this.caseField(ld), this.directionField(ld));

    if (ld.kind === "nodal") {
      this.editorEl.append(
        this.targetNodeField(ld),
        this.numRow("Fx", ld.fx, (v) => this.model.updateLoad(ld.id, { fx: v } as LoadPatch)),
        this.numRow("Fy", ld.fy, (v) => this.model.updateLoad(ld.id, { fy: v } as LoadPatch)),
        this.numRow("Fz", ld.fz, (v) => this.model.updateLoad(ld.id, { fz: v } as LoadPatch)),
        this.numRow("Mx", ld.mx, (v) => this.model.updateLoad(ld.id, { mx: v } as LoadPatch)),
        this.numRow("My", ld.my, (v) => this.model.updateLoad(ld.id, { my: v } as LoadPatch)),
        this.numRow("Mz", ld.mz, (v) => this.model.updateLoad(ld.id, { mz: v } as LoadPatch))
      );
    } else if (ld.kind === "member_point") {
      this.editorEl.append(
        this.targetMemberField(ld),
        this.bulkApplyBtn(ld),
        this.numRow("Dist", ld.dist, (v) => this.model.updateLoad(ld.id, { dist: v } as LoadPatch)),
        this.numRow("Fx", ld.fx, (v) => this.model.updateLoad(ld.id, { fx: v } as LoadPatch)),
        this.numRow("Fy", ld.fy, (v) => this.model.updateLoad(ld.id, { fy: v } as LoadPatch)),
        this.numRow("Fz", ld.fz, (v) => this.model.updateLoad(ld.id, { fz: v } as LoadPatch))
      );
    } else {
      // member_distributed
      this.editorEl.append(this.targetMemberField(ld), this.axisField(ld));
      const bulkBtn = this.bulkApplyBtn(ld);
      if (bulkBtn) this.editorEl.append(bulkBtn);
      this.editorEl.append(
        this.numRow("da", ld.da, (v) => this.model.updateLoad(ld.id, { da: v } as LoadPatch)),
        this.numRow("db", ld.db, (v) => this.model.updateLoad(ld.id, { db: v } as LoadPatch)),
        this.numRow("wa", ld.wa, (v) => this.model.updateLoad(ld.id, { wa: v } as LoadPatch)),
        this.numRow("wb", ld.wb, (v) => this.model.updateLoad(ld.id, { wb: v } as LoadPatch))
      );
    }
  }

  /** Case dropdown in the editor. */
  private caseField(ld: BcadLoad): HTMLElement {
    const r = el("div", "prop-row");
    r.append(el("span", "prop-key", "Case"));
    const sel = document.createElement("select");
    sel.className = "prop-input";
    for (const lc of this.model.allLoadCases()) {
      const o = document.createElement("option");
      o.value = String(lc.id);
      o.textContent = lc.label;
      if (lc.id === ld.caseId) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () =>
      this.model.updateLoad(ld.id, { caseId: Number(sel.value) } as LoadPatch)
    );
    r.append(sel);
    return r;
  }

  /** Direction (global/local) dropdown. */
  private directionField(ld: BcadLoad): HTMLElement {
    const r = el("div", "prop-row");
    r.append(el("span", "prop-key", "Direction"));
    const sel = document.createElement("select");
    sel.className = "prop-input";
    for (const d of ["global", "local"] as LoadDirection[]) {
      const o = document.createElement("option");
      o.value = d;
      o.textContent = d;
      if (d === ld.direction) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () =>
      this.model.updateLoad(ld.id, { direction: sel.value as LoadDirection } as LoadPatch)
    );
    r.append(sel);
    return r;
  }

  /** Node-id target editor (for nodal loads). */
  private targetNodeField(ld: Extract<BcadLoad, { kind: "nodal" }>): HTMLElement {
    const r = el("div", "prop-row");
    r.append(el("span", "prop-key", "Node"));
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.min = "1";
    input.className = "prop-input";
    input.value = String(ld.nodeId);
    input.addEventListener("change", () => {
      const v = parseInt(input.value, 10);
      if (Number.isInteger(v)) this.model.updateLoad(ld.id, { nodeId: v } as LoadPatch);
    });
    r.append(input);
    return r;
  }

  /** Member-id target editor (for member loads). */
  private targetMemberField(ld: Extract<BcadLoad, { kind: "member_point" | "member_distributed" }>): HTMLElement {
    const r = el("div", "prop-row");
    r.append(el("span", "prop-key", "Member"));
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.min = "1";
    input.className = "prop-input";
    input.value = String(ld.memberId);
    input.addEventListener("change", () => {
      const v = parseInt(input.value, 10);
      if (Number.isInteger(v)) this.model.updateLoad(ld.id, { memberId: v } as LoadPatch);
    });
    r.append(input);
    return r;
  }

  /** Distributed-load axis selector. */
  private axisField(ld: Extract<BcadLoad, { kind: "member_distributed" }>): HTMLElement {
    const r = el("div", "prop-row");
    r.append(el("span", "prop-key", "Axis"));
    const sel = document.createElement("select");
    sel.className = "prop-input";
    for (const a of ["x", "y", "z"] as const) {
      const o = document.createElement("option");
      o.value = a;
      o.textContent = a.toUpperCase();
      if (a === ld.axis) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () =>
      this.model.updateLoad(ld.id, { axis: sel.value as "x" | "y" | "z" } as LoadPatch)
    );
    r.append(sel);
    return r;
  }

  /** A labeled numeric input row (mirrors RightPanel.numField). */
  private numRow(key: string, value: number, onChange: (v: number) => void): HTMLElement {
    const r = el("div", "prop-row");
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(value);
    input.step = "any";
    input.className = "prop-input";
    input.addEventListener("change", () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) onChange(v);
    });
    r.append(el("span", "prop-key", key), input);
    return r;
  }

  /** Show a button to apply the current load to all selected members. */
  private bulkApplyBtn(ld: BcadLoad): HTMLElement {
    const eligible = this.selectedMembers.filter((mid) => mid !== (ld as any).memberId);
    const hide = eligible.length === 0;
    const row = el("div", "prop-row");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lc-add-btn";
    btn.textContent = `Apply to ${eligible.length} more ${eligible.length === 1 ? "member" : "members"}`;
    btn.title = "Duplicate this load to all selected members";
    row.style.display = hide ? "none" : "";
    btn.addEventListener("click", () => {
      for (const mid of eligible) {
        const base = { ...ld } as any;
        base.id = undefined;
        base.memberId = mid;
        base.nodeId = undefined;
        this.model.addLoad(base as LoadInput);
      }
    });
    row.append(btn);
    return row;
  }

  // ---- add actions ----

  private onAddCase(): void {
    const lc = this.model.addLoadCase();
    this.activeCaseId = lc.id;
    this.caseMgrOpen = true;
    this.reconcile();
  }

  /** Push the current multi-selection of member IDs so the editor can offer bulk-apply. */
  setSelectedMembers(ids: number[]): void {
    this.selectedMembers = ids;
    // Re-render editor if it shows a member load (bulk-apply button visibility may change)
    if (this.selectedLoadId != null) {
      const ld = this.model.getLoad(this.selectedLoadId);
      if (ld && ld.kind !== "nodal") this.renderEditor();
    }
  }

  private onAddLoad(kind: LoadKind): void {
    // Need at least one case; if none, make a default dead load case.
    let caseId = this.activeCaseId;
    if (caseId === 0 || !this.model.getLoadCase(caseId)) {
      if (this.model.loadCaseCount() === 0) {
        caseId = this.model.addLoadCase().id;
      } else {
        caseId = this.model.allLoadCases()[0].id;
      }
      this.activeCaseId = caseId;
      this.renderCaseBar();
    }

    let base: LoadInput;
    if (kind === "nodal") {
      const nodeId = this.model.allNodes()[0]?.id ?? 0;
      base = {
        caseId, kind: "nodal", nodeId,
        fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, direction: "global",
      };
    } else if (kind === "member_point") {
      const memberId = this.model.allMembers()[0]?.id ?? 0;
      base = {
        caseId, kind: "member_point", memberId,
        dist: 0, fx: 0, fy: 0, fz: 0, direction: "global",
      };
    } else {
      const memberId = this.model.allMembers()[0]?.id ?? 0;
      base = {
        caseId, kind: "member_distributed", memberId,
        axis: "y", da: 0, db: 1, wa: 0, wb: 0, direction: "global",
      };
    }
    const created = this.model.addLoad(base);
    if (created) {
      this.selectedLoadId = created.id;
      this.renderTable();
      this.renderEditor();
    } else {
      // Couldn't create — likely no target entity exists yet.
      alert(
        kind === "nodal"
          ? "Add a node first."
          : "Add a member first."
      );
    }
  }
}

// ---- pure formatting helpers ----

const LOAD_KINDS: LoadKind[] = ["nodal", "member_point", "member_distributed"];
const LOAD_KIND_LABEL: Record<LoadKind, string> = {
  nodal: "Nodal",
  member_point: "Member point",
  member_distributed: "Member distributed",
};
const LOAD_KIND_BADGE: Record<LoadKind, string> = {
  nodal: "N",
  member_point: "MP",
  member_distributed: "MD",
};

/** Short target label: N3 / M5. */
function loadTargetLabel(ld: BcadLoad): string {
  return ld.kind === "nodal" ? `N${ld.nodeId}` : `M${ld.memberId}`;
}

/**
 * Compact magnitude summary for the table cell. Shows only nonzero components
 * (or "0" when all are zero). e.g. "Fy=−10", "wY 5→8".
 */
function loadMagSummary(ld: BcadLoad): string {
  if (ld.kind === "nodal") {
    const parts: string[] = [];
    const m: [string, number][] = [
      ["Fx", ld.fx], ["Fy", ld.fy], ["Fz", ld.fz],
      ["Mx", ld.mx], ["My", ld.my], ["Mz", ld.mz],
    ];
    for (const [k, v] of m) if (v !== 0) parts.push(`${k}=${fmt(v)}`);
    return parts.length ? parts.join(" ") : "0";
  }
  if (ld.kind === "member_point") {
    const parts: string[] = [];
    for (const [k, v] of [["Fx", ld.fx], ["Fy", ld.fy], ["Fz", ld.fz]] as [string, number][]) {
      if (v !== 0) parts.push(`${k}=${fmt(v)}`);
    }
    return parts.length ? `@${fmt(ld.dist)} ${parts.join(" ")}` : `@${fmt(ld.dist)} 0`;
  }
  // distributed
  return `w${ld.axis.toUpperCase()} ${fmt(ld.wa)}→${fmt(ld.wb)} (${fmt(ld.da)}–${fmt(ld.db)})`;
}

function fmt(n: number): string {
  return parseFloat(n.toFixed(3)).toString();
}
