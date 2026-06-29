import { el, Segmented } from "./helpers";
import type { Tool } from "../types";

export interface LeftPanelCallbacks {
  onTool: (t: Tool) => void;
  onSnapSpacing: (spacing: number) => void;
}

/**
 * Left tool rail: tool selector + snap spacing control.
 */
export class LeftPanel {
  readonly node: HTMLElement;
  private tools: Segmented<Tool>;

  constructor(cb: LeftPanelCallbacks) {
    this.node = el("aside", "left-panel");
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

    this.node.append(title, this.tools.node, snapTitle, spacingWrap, help);
  }

  setTool(t: Tool): void {
    this.tools.set(t);
  }
}
