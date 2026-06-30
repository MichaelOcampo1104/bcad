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
 * with the mouse line tool, pasted, or loaded from a file. A hover-reveal × in
 * the # cell deletes a row; pasting tab/comma/space-delimited `a b tag` text
 * creates one member per line (tag optional).
 */
export class MemberGrid {
  readonly node: HTMLElement;
  private body: HTMLElement;
  private footer: HTMLElement;
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

    this.footer = el("div", "grid-foot", "0 members");
    this.node.appendChild(this.footer);

    this.draft = this.makeRow();

    // Paste: lenient parse of A/B/tag text into new members (one per line).
    this.body.addEventListener("paste", (e) => this.onPaste(e));

    model.on(() => this.reconcile());
    this.reconcile();
    queueMicrotask(() => this.draft.a.focus());
  }

  private makeRow(): MemberRow {
    const wrap = el("div", "grid-row");
    // The # cell holds the row number AND a hover-reveal delete button.
    const numWrap = el("span", "grid-cell grid-num");
    const numText = el("span", "grid-num-text", String(this.body.children.length + 1));
    const del = el("button", "grid-del", "×");
    del.type = "button";
    del.title = "Delete row";
    del.tabIndex = -1;
    numWrap.append(numText, del);
    const a = this.idInput("A");
    const b = this.idInput("B");
    const tag = this.tagSelect();
    wrap.append(numWrap, a, b, tag);
    this.body.appendChild(wrap);
    const row: MemberRow = { wrap, numWrap, numText, del, a, b, tag, memberId: null };
    del.addEventListener("click", (e) => {
      e.preventDefault();
      this.deleteRow(row);
    });
    return row;
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

  /** Remove the member for a committed row, or clear a draft row. */
  private deleteRow(row: MemberRow): void {
    if (row.memberId !== null) {
      this.model.removeMember(row.memberId);
      // reconcile() will drop the row from the DOM.
    } else {
      row.a.value = "";
      row.b.value = "";
      row.tag.value = "none";
      row.wrap.classList.remove("invalid");
      row.a.focus();
    }
  }

  /**
   * Paste handler: parse lenient A/B/tag text. One member per line; the first
   * two values are node ids (tab/comma/space separated); an optional third
   * value is the tag. Lines without two valid ids, or whose ids don't exist /
   * match, are skipped.
   */
  private onPaste(e: ClipboardEvent): void {
    const text = e.clipboardData?.getData("text");
    if (!text) return;
    if (!/[\n\t,]/.test(text)) return;
    e.preventDefault();

    for (const line of text.split(/\r?\n/)) {
      const parts = line.split(/[\t,\s]+/).filter((p) => p.length > 0);
      const a = parseInt(parts[0] ?? "", 10);
      const b = parseInt(parts[1] ?? "", 10);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) continue;
      const tagPart = parts[2];
      const tag: MemberTag = this.isTag(tagPart) ? tagPart : "none";
      this.model.addMember(a, b, { tag });
    }
    // reconcile() appends the new rows.
  }

  private isTag(v: string | undefined): v is MemberTag {
    return !!v && (MEMBER_TAGS as string[]).includes(v);
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
    this.footer.textContent = `${this.model.memberCount()} member${this.model.memberCount() === 1 ? "" : "s"}`;
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
      r.numText.textContent = String(i + 1);
    });
  }
}

interface MemberRow {
  wrap: HTMLElement;
  numWrap: HTMLElement;
  numText: HTMLElement;
  del: HTMLButtonElement;
  a: HTMLInputElement;
  b: HTMLInputElement;
  tag: HTMLSelectElement;
  memberId: number | null;
}
