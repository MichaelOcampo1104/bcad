import { el } from "./helpers";
import type { BcadMember, MemberTag } from "../types";
import { MEMBER_TAGS } from "../types";
import type { Model } from "../model/Model";

/**
 * Spreadsheet-style member editor, synchronized with the Model — same reactive
 * pattern as NodeGrid. Columns: # / NodeA / NodeB / Tag.
 *
 * NodeA/NodeB reference nodes by **id** (the model's stable id, e.g. 1,2,3…),
 * which is what gets exported. A member is created once both endpoints are
 * valid, distinct, existing node ids. The Tag column is a dropdown.
 *
 * Rows appear here for members created *anywhere* — typed in the grid, drawn
 * with the mouse line tool, or loaded from a file.
 */
export class MemberGrid {
  readonly node: HTMLElement;
  private body: HTMLElement;
  private rows = new Map<number, MemberRow>();
  private draft: MemberRow;

  constructor(private readonly model: Model) {
    this.node = el("div", "member-grid");

    const head = el("div", "grid-row grid-head");
    head.append(
      el("span", "grid-cell grid-num", "#"),
      el("span", "grid-cell", "A"),
      el("span", "grid-cell", "B"),
      el("span", "grid-cell grid-tag-col", "Tag")
    );
    this.node.appendChild(head);

    this.body = el("div", "grid-body");
    this.node.appendChild(this.body);

    this.draft = this.makeRow();

    model.on(() => this.reconcile());
    this.reconcile();
    queueMicrotask(() => this.draft.a.focus());
  }

  private makeRow(): MemberRow {
    const wrap = el("div", "grid-row");
    const num = el("span", "grid-cell grid-num", String(this.body.children.length + 1));
    const a = this.idInput("A");
    const b = this.idInput("B");
    const tag = this.tagSelect();
    wrap.append(num, a, b, tag);
    this.body.appendChild(wrap);
    return { wrap, num, a, b, tag, memberId: null };
  }

  private idInput(label: string): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.min = "1";
    input.className = "grid-cell grid-input";
    input.title = `${label} node id`;
    input.addEventListener("input", () => this.evaluate(this.rowOf(input)));
    input.addEventListener("keydown", (e) => this.onKey(e));
    return input;
  }

  private tagSelect(): HTMLSelectElement {
    const sel = document.createElement("select");
    sel.className = "grid-cell grid-select";
    sel.title = "Member tag (beam/column/truss/…)";
    for (const t of MEMBER_TAGS) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => this.evaluate(this.rowOf(sel)));
    sel.addEventListener("keydown", (e) => this.onKey(e));
    return sel;
  }

  private rowOf(el: HTMLElement): MemberRow {
    const found = [...this.rows.values(), this.draft].find(
      (r) => r.a === el || r.b === el || r.tag === el
    );
    return found ?? this.draft;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const target = e.target as HTMLElement;
    const row = this.rowOf(target);
    const cells: HTMLElement[] = [row.a, row.b, row.tag];
    const idx = cells.indexOf(target);
    this.evaluate(row);
    if (idx < 2) {
      cells[idx + 1].focus();
    } else {
      this.nextRow(row).a.focus();
    }
  }

  private nextRow(row: MemberRow): MemberRow {
    if (row === this.draft) {
      this.evaluate(this.draft);
      if (this.draft.memberId !== null) {
        this.rows.set(this.draft.memberId, this.draft);
        this.draft = this.makeRow();
      }
      return this.draft;
    }
    const ordered = this.orderedRows();
    const i = ordered.indexOf(row);
    return ordered[i + 1] ?? this.draft;
  }

  private orderedRows(): MemberRow[] {
    const all: MemberRow[] = [];
    this.body.querySelectorAll<HTMLElement>(".grid-row:not(.grid-head)").forEach((w) => {
      const r = [...this.rows.values(), this.draft].find((row) => row.wrap === w);
      if (r) all.push(r);
    });
    return all;
  }

  /** Create / update / delete the member for a row from its cell values. */
  private evaluate(row: MemberRow): void {
    const av = row.a.value.trim();
    const bv = row.b.value.trim();
    const a = parseInt(av, 10);
    const b = parseInt(bv, 10);
    const tag = row.tag.value as MemberTag;
    const allEmpty = av === "" && bv === "";

    if (Number.isInteger(a) && Number.isInteger(b) && a !== b) {
      if (row.memberId === null) {
        const m = this.model.addMember(a, b, { tag });
        if (m) {
          row.memberId = m.id;
          row.wrap.classList.add("committed");
        } else {
          row.wrap.classList.add("invalid");
        }
      } else {
        this.model.updateMember(row.memberId, { nodeAId: a, nodeBId: b, tag });
      }
    } else if (allEmpty && row.memberId !== null) {
      this.model.removeMember(row.memberId);
    } else {
      row.wrap.classList.toggle("invalid", !allEmpty);
    }
  }

  private reconcile(): void {
    const modelMembers = new Map(this.model.allMembers().map((m) => [m.id, m]));

    for (const [id, row] of this.rows) {
      const m = modelMembers.get(id);
      if (!m) {
        row.wrap.remove();
        this.rows.delete(id);
        continue;
      }
      row.wrap.classList.add("committed");
      row.wrap.classList.remove("invalid");
      this.syncCell(row.a, m.nodeAId);
      this.syncCell(row.b, m.nodeBId);
      this.syncSelect(row.tag, m.tag);
    }

    for (const m of modelMembers.values()) {
      if (!this.rows.has(m.id)) {
        const row = this.draft.memberId === null ? this.promoteDraft(m) : this.makeRow();
        row.memberId = m.id;
        row.wrap.classList.add("committed");
        this.syncCell(row.a, m.nodeAId);
        this.syncCell(row.b, m.nodeBId);
        this.syncSelect(row.tag, m.tag);
        this.rows.set(m.id, row);
      }
    }

    this.renumber();
  }

  private syncCell(input: HTMLInputElement, value: number): void {
    if (document.activeElement === input) return;
    input.value = String(value);
  }

  private syncSelect(sel: HTMLSelectElement, value: MemberTag): void {
    if (document.activeElement === sel) return;
    sel.value = value;
  }

  private promoteDraft(m: BcadMember): MemberRow {
    this.draft.memberId = m.id;
    const promoted = this.draft;
    this.rows.set(m.id, promoted);
    this.draft = this.makeRow();
    return promoted;
  }

  private renumber(): void {
    this.orderedRows().forEach((r, i) => {
      r.num.textContent = String(i + 1);
    });
  }
}

interface MemberRow {
  wrap: HTMLElement;
  num: HTMLElement;
  a: HTMLInputElement;
  b: HTMLInputElement;
  tag: HTMLSelectElement;
  memberId: number | null;
}
