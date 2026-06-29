import { el } from "./helpers";
import type { BcadNode } from "../types";
import type { Model } from "../model/Model";

/**
 * Spreadsheet-style node editor that is **synchronized with the Model**.
 *
 * Rows are keyed by node id. The grid is the source of truth for *editing*
 * while the user is focused on a cell; the Model is the source of truth for
 * everything else. On any model change the grid reconciles:
 *   - new nodes (from mouse/line tool) append as a row,
 *   - deleted nodes drop their row,
 *   - edited nodes update their row — unless the user is actively typing in
 *     that exact cell (so we never clobber mid-keystroke).
 *
 * There is always at least one blank "draft" row at the bottom for new entry;
 * a fresh draft row is added whenever the current one becomes a real node.
 */
export class NodeGrid {
  readonly node: HTMLElement;
  private body: HTMLElement;
  private rows = new Map<number, NodeRow>();
  /** The trailing blank row (no node yet). Always present. */
  private draft: NodeRow;

  constructor(private readonly model: Model) {
    this.node = el("div", "node-grid");

    const head = el("div", "grid-row grid-head");
    head.append(el("span", "grid-cell grid-num", "#"), el("span", "grid-cell", "X"), el("span", "grid-cell", "Y"), el("span", "grid-cell", "Z"));
    this.node.appendChild(head);

    this.body = el("div", "grid-body");
    this.node.appendChild(this.body);

    this.draft = this.makeRow();

    // Reconcile whenever the model changes.
    model.on(() => this.reconcile());
    this.reconcile();
    queueMicrotask(() => this.draft.x.focus());
  }

  private makeRow(): NodeRow {
    const wrap = el("div", "grid-row");
    const num = el("span", "grid-cell grid-num", String(this.body.children.length + 1));
    const x = this.cellInput();
    const y = this.cellInput();
    const z = this.cellInput();
    wrap.append(num, x, y, z);
    this.body.appendChild(wrap);
    return { wrap, num, x, y, z, nodeId: null };
  }

  private cellInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.className = "grid-cell grid-input";
    input.title = "Coordinate";
    input.addEventListener("input", () => this.evaluate(this.rowOf(input)));
    input.addEventListener("keydown", (e) => this.onKey(e));
    return input;
  }

  private rowOf(input: HTMLInputElement): NodeRow {
    const found = [...this.rows.values(), this.draft].find(
      (r) => r.x === input || r.y === input || r.z === input
    );
    return found ?? this.draft;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const target = e.target as HTMLInputElement;
    const row = this.rowOf(target);
    const cells = [row.x, row.y, row.z];
    const idx = cells.indexOf(target);
    this.evaluate(row);
    // Move to next cell, or next row.
    if (idx < 2) {
      cells[idx + 1].focus();
    } else {
      this.nextRow(row).x.focus();
    }
  }

  /** Move past the given row, promoting the draft if needed. */
  private nextRow(row: NodeRow): NodeRow {
    if (row === this.draft) {
      // Promote draft to a real row (if it created a node) and make a new draft.
      this.evaluate(this.draft);
      if (this.draft.nodeId !== null) {
        this.rows.set(this.draft.nodeId, this.draft);
        this.draft = this.makeRow();
      }
      return this.draft;
    }
    // Find the row after `row` in DOM order.
    const ordered = this.orderedRows();
    const i = ordered.indexOf(row);
    return ordered[i + 1] ?? this.draft;
  }

  private orderedRows(): NodeRow[] {
    const all: NodeRow[] = [];
    this.body.querySelectorAll<HTMLElement>(".grid-row:not(.grid-head)").forEach((w) => {
      const r = [...this.rows.values(), this.draft].find((row) => row.wrap === w);
      if (r) all.push(r);
    });
    return all;
  }

  /** Commit/clear the node for a row based on its current cell values. */
  private evaluate(row: NodeRow): void {
    const xv = row.x.value.trim();
    const yv = row.y.value.trim();
    const zv = row.z.value.trim();
    const x = parseFloat(xv);
    const y = parseFloat(yv);
    const z = parseFloat(zv);
    const allValid = isFinite(x) && isFinite(y) && isFinite(z);
    const allEmpty = xv === "" && yv === "" && zv === "";

    if (allValid) {
      if (row.nodeId === null) {
        // Create node; the reconcile will link this row to it.
        const id = this.model.addNode(x, y, z).id;
        row.nodeId = id;
        row.wrap.classList.add("committed");
      } else {
        this.model.updateNode(row.nodeId, { x, y, z });
      }
    } else if (allEmpty && row.nodeId !== null) {
      this.model.removeNode(row.nodeId);
    } else {
      row.wrap.classList.toggle("invalid", !allEmpty);
    }
  }

  /**
   * Sync rows with the model. Crucially, do NOT overwrite a cell the user is
   * currently editing — that's the feedback-loop guard.
   */
  private reconcile(): void {
    const modelNodes = new Map(this.model.allNodes().map((n) => [n.id, n]));

    // Update or mark existing rows for removal.
    for (const [id, row] of this.rows) {
      const n = modelNodes.get(id);
      if (!n) {
        // Node was deleted elsewhere — drop the row.
        row.wrap.remove();
        this.rows.delete(id);
        continue;
      }
      row.wrap.classList.add("committed");
      row.wrap.classList.remove("invalid");
      this.syncCell(row.x, n.x);
      this.syncCell(row.y, n.y);
      this.syncCell(row.z, n.z);
    }

    // Append rows for nodes that don't have one yet (e.g. mouse-drawn).
    for (const n of modelNodes.values()) {
      if (!this.rows.has(n.id)) {
        const row = this.draft.nodeId === null ? this.promoteDraft(n) : this.makeRow();
        row.nodeId = n.id;
        row.wrap.classList.add("committed");
        this.syncCell(row.x, n.x);
        this.syncCell(row.y, n.y);
        this.syncCell(row.z, n.z);
        this.rows.set(n.id, row);
      }
    }

    this.renumber();
  }

  /** Write a value into a cell unless it's focused (mid-edit guard). */
  private syncCell(input: HTMLInputElement, value: number): void {
    if (document.activeElement === input) return;
    input.value = String(round(value));
  }

  private promoteDraft(n: BcadNode): NodeRow {
    // Turn the current draft into the row for this node, then make a new draft.
    this.draft.nodeId = n.id;
    const promoted = this.draft;
    this.rows.set(n.id, promoted);
    this.draft = this.makeRow();
    return promoted;
  }

  private renumber(): void {
    const ordered = this.orderedRows();
    ordered.forEach((r, i) => {
      r.num.textContent = String(i + 1);
    });
  }
}

interface NodeRow {
  wrap: HTMLElement;
  num: HTMLElement;
  x: HTMLInputElement;
  y: HTMLInputElement;
  z: HTMLInputElement;
  nodeId: number | null;
}

function round(n: number): number {
  return parseFloat(n.toFixed(6));
}
