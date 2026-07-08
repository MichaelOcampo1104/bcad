import { el } from "./helpers";
import type { Model } from "../model/Model";
import type { LoadCase, LoadCombo } from "../types";

/**
 * Load-combinations management panel. Model-driven like the other panels.
 *
 * Layout:
 *   - Combos table: one row per combination (label + factor summary). Click to
 *     select + edit; hover × deletes.
 *   - Inline editor: a name field + one factor input per existing load case
 *     (0 = omitted), with a live "Σ factors for case" hint per row.
 *   - + Add combination button.
 */
export class CombosPanel {
  readonly node: HTMLElement;
  private tableBody: HTMLElement;
  private footer: HTMLElement;
  private editorEl: HTMLElement;
  private selectedComboId: number | null = null;

  constructor(private readonly model: Model) {
    this.node = el("div", "combos-panel");

    // ---- Table ----
    const head = el("div", "grid-row grid-head");
    head.append(
      el("span", "grid-cell grid-num", "#"),
      el("span", "grid-cell", "Name"),
      el("span", "grid-cell", "Factors")
    );
    this.tableBody = el("div", "grid-body");
    this.footer = el("div", "grid-foot", "0 combinations");
    const tableWrap = el("div", "combos-table");
    tableWrap.append(head, this.tableBody, this.footer);

    // ---- Inline editor ----
    this.editorEl = el("div", "combo-editor");

    // ---- Add button ----
    const addBtn = el("button", "lc-add-btn combo-add-btn", "+ Add combination");
    addBtn.type = "button";
    addBtn.addEventListener("click", () => this.onAdd());

    this.node.append(tableWrap, this.editorEl, addBtn);

    model.on(() => this.reconcile());
    this.reconcile();
  }

  private reconcile(): void {
    this.renderTable();
    this.renderEditor();
  }

  // ---- table ----

  private renderTable(): void {
    this.tableBody.replaceChildren();
    const combos = this.model.allLoadCombos();
    if (combos.length === 0) {
      this.tableBody.append(el("div", "ld-empty", "No combinations yet."));
    }
    for (let i = 0; i < combos.length; i++) {
      const cb = combos[i];
      const row = el("div", "grid-row ld-row");
      if (cb.id === this.selectedComboId) row.classList.add("selected");
      row.addEventListener("click", () => {
        this.selectedComboId = cb.id;
        this.renderTable();
        this.renderEditor();
      });

      const numWrap = el("span", "grid-cell grid-num");
      numWrap.append(el("span", "grid-num-text", String(i + 1)));
      const del = el("button", "grid-del", "×");
      del.type = "button";
      del.tabIndex = -1;
      del.title = "Delete combination";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.model.removeLoadCombo(cb.id);
        if (this.selectedComboId === cb.id) this.selectedComboId = null;
      });
      numWrap.append(del);

      const name = el("span", "grid-cell", cb.label);
      const factors = el("span", "grid-cell combo-summary", factorSummary(cb, this.model));
      row.append(numWrap, name, factors);
      this.tableBody.append(row);
    }
    this.footer.textContent = `${combos.length} combination${combos.length === 1 ? "" : "s"}`;
  }

  // ---- editor ----

  private renderEditor(): void {
    this.editorEl.replaceChildren();
    const cb = this.selectedComboId != null ? this.model.getLoadCombo(this.selectedComboId) : undefined;
    if (!cb) {
      this.editorEl.append(el("div", "ld-empty", "Select a combination to edit it."));
      return;
    }

    // Name field.
    const nameRow = el("div", "prop-row");
    nameRow.append(el("span", "prop-key", "Name"));
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "prop-input";
    nameInput.value = cb.label;
    nameInput.addEventListener("change", () =>
      this.model.updateLoadCombo(cb.id, { label: nameInput.value.trim() || cb.label })
    );
    nameRow.append(nameInput);
    this.editorEl.append(nameRow);

    // One factor input per existing load case.
    const cases = this.model.allLoadCases();
    if (cases.length === 0) {
      this.editorEl.append(el("div", "ld-empty", "No load cases — add one in the Loads tab first."));
      return;
    }
    this.editorEl.append(el("div", "combo-factors-title", "Factors"));
    for (const lc of cases) {
      const existing = cb.factors.find((f) => f.caseId === lc.id);
      const value = existing?.factor ?? 0;
      this.editorEl.append(this.factorRow(cb, lc, value));
    }
  }

  /** A labeled factor input for one case. Writing 0 removes the factor term. */
  private factorRow(cb: LoadCombo, lc: LoadCase, value: number): HTMLElement {
    const r = el("div", "prop-row");
    r.append(el("span", "prop-key", lc.label));
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.className = "prop-input";
    input.value = String(value);
    input.addEventListener("change", () => {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) return;
      const next = cb.factors.filter((f) => f.caseId !== lc.id);
      if (v !== 0) next.push({ caseId: lc.id, factor: v });
      this.model.updateLoadCombo(cb.id, { factors: next });
    });
    r.append(input);
    return r;
  }

  // ---- add ----

  private onAdd(): void {
    const cb = this.model.addLoadCombo();
    this.selectedComboId = cb.id;
    this.renderTable();
    this.renderEditor();
  }
}

/**
 * Short factor summary for the table, e.g. "1.2DL+1.6LL". Uses each case's
 * label. Combinations with no factors show "—".
 */
function factorSummary(cb: LoadCombo, model: Model): string {
  if (cb.factors.length === 0) return "—";
  const parts: string[] = [];
  for (const f of cb.factors) {
    const lc = model.getLoadCase(f.caseId);
    const label = lc?.label ?? `C${f.caseId}`;
    const factor = Number.isInteger(f.factor) ? String(f.factor) : f.factor.toFixed(2);
    parts.push(`${factor}·${label}`);
  }
  return parts.join(" + ");
}
