import { el, Segmented } from "./helpers";
import type { Tool } from "../types";
import type { Model } from "../model/Model";
import { NodeGrid } from "./NodeGrid";
import { MemberGrid } from "./MemberGrid";

export interface LeftPanelCallbacks {
  onTool: (t: Tool) => void;
  onSnapSpacing: (spacing: number) => void;
}

/**
 * Left tool rail: tool selector, snap spacing, and two spreadsheet-style
 * editors — one for nodes (X/Y/Z) and one for members (NodeA/NodeB/Tag).
 * Both grids are reactive: they reflect whatever is in the Model, whether the
 * entity was typed here, drawn with the mouse, or loaded from a file.
 */
export class LeftPanel {
  readonly node: HTMLElement;
  private tools: Segmented<Tool>;

  constructor(model: Model, cb: LeftPanelCallbacks) {
    this.node = el("aside", "left-panel");

    // ---- Tools ----
    const title = el("div", "panel-title", "Tools");
    this.tools = new Segmented<Tool>(
      [
        { value: "select", label: "Select", title: "Select (1)" },
        { value: "node", label: "Node", title: "Place node (2)" },
        { value: "line", label: "Line", title: "Draw member (3)" },
        { value: "delete", label: "Delete", title: "Delete (4)" },
      ],
      cb.onTool
    );

    // ---- Snap spacing ----
    const snapTitle = el("div", "panel-title", "Snap Spacing");
    const spacingWrap = el("div", "spacing-wrap");
    const input = document.createElement("input");
    input.type = "number";
    input.className = "spacing-input";
    input.value = "1";
    input.min = "0.1";
    input.step = "0.5";
    input.title = "Grid snap spacing (model units)";
    input.addEventListener("change", () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v) && v > 0) cb.onSnapSpacing(v);
    });
    spacingWrap.append(input, el("span", "hint", "units"));

    // ---- Node grid ----
    const nodeTitle = el("div", "panel-title", "Nodes");
    const nodeHint = el("div", "grid-hint", "X/Y/Z. Enter moves down. Nodes from the mouse also appear here.");
    const nodeGrid = new NodeGrid(model);

    // ---- Member grid ----
    const memberTitle = el("div", "panel-title", "Members");
    const memberHint = el("div", "grid-hint", "Node A & B ids + tag. Lines drawn with the mouse appear here too.");
    const memberGrid = new MemberGrid(model);

    // ---- Mouse help ----
    const help = el("div", "panel-help");
    help.innerHTML = `
      <div><b>Mouse</b></div>
      <div>Left-drag: orbit</div>
      <div>Right-drag: pan</div>
      <div>Wheel: zoom</div>
      <div><b>Keys</b></div>
      <div>1–4: tools</div>
      <div>Del: remove</div>
      <div>Esc: cancel</div>
    `;

    this.node.append(
      title,
      this.tools.node,
      snapTitle,
      spacingWrap,
      nodeTitle,
      nodeHint,
      nodeGrid.node,
      memberTitle,
      memberHint,
      memberGrid.node,
      help
    );
  }

  setTool(t: Tool): void {
    this.tools.set(t);
  }
}
