import { el, Segmented } from "./helpers";
import type { SelectionSet, Tool } from "../types";
import type { Model } from "../model/Model";
import { NodeGrid } from "./NodeGrid";
import { MemberGrid } from "./MemberGrid";
import { CopyArray } from "./CopyArray";

export interface LeftPanelCallbacks {
  onTool: (t: Tool) => void;
  onSnapSpacing: (spacing: number) => void;
  onCopy: (dx: number, dy: number, dz: number) => void;
  onArray: (dx: number, dy: number, dz: number, count: number) => void;
  onCopyPolar: (cx: number, cy: number, angDeg: number) => void;
  onArrayPolar: (cx: number, cy: number, angDeg: number, count: number) => void;
}

/**
 * Left tool rail: tool selector, snap spacing, two spreadsheet-style
 * editors (nodes + members), and a Copy & Array command block.
 *
 * Everything is reactive: the grids reflect whatever is in the Model, whether
 * the entity was typed here, drawn with the mouse, copied, or loaded from a
 * file. The Copy & Array block mirrors the live selection coming from App.
 */
export class LeftPanel {
  readonly node: HTMLElement;
  private tools: Segmented<Tool>;
  private copyArray: CopyArray;

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

    // ---- Copy & Array (acts on the live selection) ----
    const copyTitle = el("div", "panel-title", "Copy & Array");
    this.copyArray = new CopyArray({
      onCopy: (dx, dy, dz) => cb.onCopy(dx, dy, dz),
      onArray: (dx, dy, dz, count) => cb.onArray(dx, dy, dz, count),
      onCopyPolar: (cx, cy, angDeg) => cb.onCopyPolar(cx, cy, angDeg),
      onArrayPolar: (cx, cy, angDeg, count) => cb.onArrayPolar(cx, cy, angDeg, count),
    });

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

    // Fixed top section: tools, snap, copy/array — always visible.
    const fixedSection = el("div", "left-panel-fixed");
    fixedSection.append(
      title,
      this.tools.node,
      snapTitle,
      spacingWrap,
      copyTitle,
      this.copyArray.node,
    );

    // Scrollable bottom section: grids + help.
    const scrollSection = el("div", "left-panel-scroll");
    scrollSection.append(
      nodeTitle,
      nodeHint,
      nodeGrid.node,
      memberTitle,
      memberHint,
      memberGrid.node,
      help
    );

    this.node.append(fixedSection, scrollSection);
  }

  setTool(t: Tool): void {
    this.tools.set(t);
  }

  /** Push the live selection so the Copy & Array block reflects + enables. */
  setSelection(sel: SelectionSet, label: string): void {
    this.copyArray.setSelection(sel, label);
  }
}
