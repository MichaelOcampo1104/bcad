import { el } from "./helpers";
import type { Model } from "../model/Model";
import type { MemberTag, Selection, SelectionSet } from "../types";
import { MEMBER_TAGS, selKey } from "../types";

export interface RightPanelCallbacks {
  /** Replace the selection with the given set (plain click in tree). */
  onSelect: (set: SelectionSet) => void;
  /** Toggle a single entity in/out of the selection (Ctrl+click in tree). */
  onToggleSelect: (sel: Selection) => void;
  onClearSelection: () => void;
  onEditNode: (id: number, patch: { label?: string; x?: number; y?: number; z?: number }) => void;
  onEditMember: (id: number, patch: { label?: string; tag?: MemberTag }) => void;
  /** Apply one tag to every selected member (bulk edit). */
  onBulkTag: (tag: MemberTag) => void;
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

    const propsTitle = el("div", "panel-title", "Properties");
    this.propsEl = el("div", "props");

    const treeTitle = el("div", "panel-title", "Model Tree");
    const tree = el("div", "tree");
    this.nodesListEl = el("div", "tree-list");
    this.membersListEl = el("div", "tree-list");
    tree.append(el("div", "tree-sub", "Nodes"), this.nodesListEl);
    tree.append(el("div", "tree-sub", "Members"), this.membersListEl);

    this.node.append(propsTitle, this.propsEl, treeTitle, tree);
  }

  /** Full refresh of properties + tree. Called on any model/selection change. */
  refresh(selection: SelectionSet): void {
    this.renderProps(selection);
    this.renderTree(selection);
  }

  private renderProps(sel: SelectionSet): void {
    this.propsEl.replaceChildren();
    if (sel.length === 0) {
      this.propsEl.append(el("div", "props-empty", "Nothing selected"));
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
        this.numField("Z", n.z, (v) => this.cb.onEditNode(n.id, { z: v }))
      );
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
    }
  }

  /** Summary + bulk tag editor for a multi-selection. */
  private renderMultiProps(sel: SelectionSet): void {
    const nodes = sel.filter((s) => s.kind === "node").length;
    const members = sel.length - nodes;

    const summary = el("div", "props-summary");
    const head = el("div", "props-summary-head", `${sel.length} selected`);
    const detail = el(
      "div",
      "props-summary-detail",
      `${nodes} node${nodes !== 1 ? "s" : ""}, ${members} member${members !== 1 ? "s" : ""}`
    );
    summary.append(head, detail);

    if (members > 0) {
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

  private numField(key: string, value: number, onChange: (v: number) => void): HTMLElement {
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
