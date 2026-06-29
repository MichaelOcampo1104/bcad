import { el, Segmented } from "./helpers";
import type { Tool } from "../types";

export interface LeftPanelCallbacks {
  onTool: (t: Tool) => void;
  onSnapSpacing: (spacing: number) => void;
  /** Add a node at typed coordinates. Returns false if coords were invalid. */
  onAddNode: (x: number, y: number, z: number) => boolean;
}

/**
 * Left tool rail: tool selector, snap spacing, and a typed X/Y/Z input for
 * placing nodes precisely (vs. clicking with the mouse).
 */
export class LeftPanel {
  readonly node: HTMLElement;
  private tools: Segmented<Tool>;
  private xInput!: HTMLInputElement;
  private yInput!: HTMLInputElement;
  private zInput!: HTMLInputElement;
  private addBtn: HTMLButtonElement;

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

    // ---- Add node by coordinates ----
    const coordTitle = el("div", "panel-title", "Add Node (X, Y, Z)");
    const xWrap = el("div", "coord-field");
    const yWrap = el("div", "coord-field");
    const zWrap = el("div", "coord-field");
    this.xInput = this.coordField("X", xWrap);
    this.yInput = this.coordField("Y", yWrap);
    this.zInput = this.coordField("Z", zWrap);

    this.addBtn = document.createElement("button");
    this.addBtn.type = "button";
    this.addBtn.textContent = "+ Add Node";
    this.addBtn.className = "add-node-btn";
    this.addBtn.title = "Add a node at the typed coordinates (Enter)";

    const submit = () => this.submit(cb.onAddNode);
    this.addBtn.addEventListener("click", submit);
    // Enter in any coord field submits too.
    for (const inp of [this.xInput, this.yInput, this.zInput]) {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
    }

    const coordGroup = el("div", "coord-group");
    coordGroup.append(xWrap, yWrap, zWrap, this.addBtn);

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

    this.node.append(title, this.tools.node, snapTitle, spacingWrap, coordTitle, coordGroup, help);
  }

  setTool(t: Tool): void {
    this.tools.set(t);
  }

  private coordField(label: string, wrap: HTMLElement): HTMLInputElement {
    const lab = el("span", "coord-label", label);
    const input = document.createElement("input");
    input.type = "number";
    input.value = "0";
    input.step = "any";
    input.className = "coord-input";
    input.title = `${label} coordinate`;
    wrap.append(lab, input);
    return input;
  }

  private submit(onAdd: (x: number, y: number, z: number) => boolean): void {
    const x = parseFloat(this.xInput.value);
    const y = parseFloat(this.yInput.value);
    const z = parseFloat(this.zInput.value);
    if (![x, y, z].every(Number.isFinite)) {
      this.flash("Enter valid numbers for X, Y, Z");
      return;
    }
    const ok = onAdd(x, y, z);
    if (ok) {
      // Keep the values so the user can chain similar nodes; do not clear.
    } else {
      this.flash("Could not add node");
    }
  }

  /** Briefly show a message on the Add button. */
  private flash(msg: string): void {
    const original = this.addBtn.textContent;
    this.addBtn.textContent = msg;
    this.addBtn.classList.add("error");
    setTimeout(() => {
      this.addBtn.textContent = original;
      this.addBtn.classList.remove("error");
    }, 1500);
  }
}
