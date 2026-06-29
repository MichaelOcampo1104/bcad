import { el } from "./helpers";
import type { Model } from "../model/Model";
import type { Selection } from "../types";

export interface RightPanelCallbacks {
  onSelect: (sel: Selection | null) => void;
  onEditNode: (id: number, patch: { label?: string; x?: number; y?: number; z?: number }) => void;
  onEditMember: (id: number, label: string) => void;
}

/**
 * Right panel: Properties (selected entity) + Model Tree (nodes/members).
 * Reads from the Model for the tree; reflects the live selection for props.
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

  /** Full refresh of properties + tree. Called on any model change. */
  refresh(selection: Selection | null): void {
    this.renderProps(selection);
    this.renderTree(selection);
  }

  private renderProps(sel: Selection | null): void {
    this.propsEl.replaceChildren();
    if (!sel) {
      this.propsEl.append(el("div", "props-empty", "Nothing selected"));
      return;
    }
    if (sel.kind === "node") {
      const n = this.model.getNode(sel.id);
      if (!n) return;
      this.propsEl.append(
        this.row("Kind", "Node"),
        this.field("Label", n.label, (v) => this.cb.onEditNode(n.id, { label: v })),
        this.numField("X", n.x, (v) => this.cb.onEditNode(n.id, { x: v })),
        this.numField("Y", n.y, (v) => this.cb.onEditNode(n.id, { y: v })),
        this.numField("Z", n.z, (v) => this.cb.onEditNode(n.id, { z: v }))
      );
    } else {
      const m = this.model.getMember(sel.id);
      if (!m) return;
      const a = this.model.getNode(m.nodeAId);
      const b = this.model.getNode(m.nodeBId);
      const len =
        a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z).toFixed(3) : "—";
      this.propsEl.append(
        this.row("Kind", "Member"),
        this.field("Label", m.label, (v) => this.cb.onEditMember(m.id, v)),
        this.row("Node A", m.nodeAId.toString()),
        this.row("Node B", m.nodeBId.toString()),
        this.row("Length", len)
      );
    }
  }

  private renderTree(sel: Selection | null): void {
    this.nodesListEl.replaceChildren();
    this.membersListEl.replaceChildren();

    const nodes = this.model.allNodes();
    if (nodes.length === 0) this.nodesListEl.append(el("div", "tree-empty", "No nodes"));
    for (const n of nodes) {
      const row = el("div", "tree-item");
      if (sel?.kind === "node" && sel.id === n.id) row.classList.add("selected");
      const label = el("span", "tree-label", n.label);
      const coords = el("span", "tree-coords", `(${fmt(n.x)}, ${fmt(n.y)}, ${fmt(n.z)})`);
      row.append(label, coords);
      row.addEventListener("click", () => this.cb.onSelect({ kind: "node", id: n.id }));
      this.nodesListEl.appendChild(row);
    }

    const members = this.model.allMembers();
    if (members.length === 0) this.membersListEl.append(el("div", "tree-empty", "No members"));
    for (const m of members) {
      const row = el("div", "tree-item");
      if (sel?.kind === "member" && sel.id === m.id) row.classList.add("selected");
      const label = el("span", "tree-label", m.label);
      const ends = el("span", "tree-coords", `${m.nodeAId} → ${m.nodeBId}`);
      row.append(label, ends);
      row.addEventListener("click", () => this.cb.onSelect({ kind: "member", id: m.id }));
      this.membersListEl.appendChild(row);
    }
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
}

function fmt(n: number): string {
  return parseFloat(n.toFixed(3)).toString();
}
