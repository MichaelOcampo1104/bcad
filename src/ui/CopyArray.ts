import { el, Segmented } from "./helpers";
import type { Selection } from "../types";

export type ArrayMode = "linear" | "polar";

export interface CopyArrayCallbacks {
  /** Linear copy the current selection by the offset. */
  onCopy: (dx: number, dy: number, dz: number) => void;
  /** Linear array the current selection by the offset, count times. */
  onArray: (dx: number, dy: number, dz: number, count: number) => void;
  /** Polar copy the current selection one angular step about (cx,cy). */
  onCopyPolar: (cx: number, cy: number, angDeg: number) => void;
  /** Polar array the current selection about (cx,cy), count times by angDeg. */
  onArrayPolar: (cx: number, cy: number, angDeg: number, count: number) => void;
}

/**
 * Copy & Array command block for the left panel.
 *
 * Two modes share the same Copy/Array buttons:
 *  - Linear: shift by an (X/Y/Z) offset. Array repeats along that offset.
 *  - Polar: rotate about a center (X/Y) by an angle (degrees). Array repeats
 *    around the center; a full circle = angle/count step. For a member, both
 *    endpoints are duplicated too, so the copy is a full structural duplicate
 *    (same tag). Entities that land on existing geometry snap/dedupe.
 *
 * Nothing to do until a selection exists, so the block stays disabled then.
 */
export class CopyArray {
  readonly node: HTMLElement;
  private sel: Selection | null = null;
  private mode: ArrayMode = "linear";

  private readonly modeSeg: Segmented<ArrayMode>;
  private readonly linearBlock: HTMLElement;
  private readonly polarBlock: HTMLElement;

  // Linear inputs.
  private readonly x: HTMLInputElement;
  private readonly y: HTMLInputElement;
  private readonly z: HTMLInputElement;

  // Polar inputs.
  private readonly cx: HTMLInputElement;
  private readonly cy: HTMLInputElement;
  private readonly ang: HTMLInputElement;

  private readonly count: HTMLInputElement;
  private readonly copyBtn: HTMLButtonElement;
  private readonly arrayBtn: HTMLButtonElement;
  private readonly target: HTMLElement;

  constructor(cb: CopyArrayCallbacks) {
    this.node = el("div", "copy-array");

    this.target = el("div", "copy-target", "Select a node or member first");
    this.target.title = "Copy/Array acts on the currently selected entity";

    // Mode toggle.
    const modeLabel = el("div", "copy-label", "Mode");
    this.modeSeg = new Segmented<ArrayMode>(
      [
        { value: "linear", label: "Linear", title: "Offset by a vector" },
        { value: "polar", label: "Polar", title: "Rotate about a center" },
      ],
      (m) => this.setMode(m)
    );

    // ---- Linear params ----
    this.linearBlock = el("div", "copy-block");
    const offLabel = el("div", "copy-label", "Offset (X / Y / Z)");
    const offsetRow = el("div", "copy-offset");
    this.x = this.num("0", "X offset", "copy-offset-input");
    this.y = this.num("0", "Y offset", "copy-offset-input");
    this.z = this.num("0", "Z offset", "copy-offset-input");
    offsetRow.append(this.x, this.y, this.z);
    this.linearBlock.append(offLabel, offsetRow);

    // ---- Polar params ----
    this.polarBlock = el("div", "copy-block");
    const centerLabel = el("div", "copy-label", "Center (X / Y)");
    const centerRow = el("div", "copy-offset");
    this.cx = this.num("0", "Center X (rotation pivot)", "copy-offset-input");
    this.cy = this.num("0", "Center Y (rotation pivot)", "copy-offset-input");
    centerRow.append(this.cx, this.cy);
    const angLabel = el("div", "copy-label", "Angle (°, per step)");
    const angRow = el("div", "copy-offset");
    this.ang = this.num("360", "Rotation per copy in degrees (use 0 for full-circle)", "copy-offset-input");
    angRow.append(this.ang);
    this.polarBlock.append(centerLabel, centerRow, angLabel, angRow);

    // Count (shared).
    const countLabel = el("div", "copy-label", "Copies (Array)");
    const countRow = el("div", "copy-count");
    this.count = document.createElement("input");
    this.count.type = "number";
    this.count.className = "copy-count-input";
    this.count.value = "3";
    this.count.min = "1";
    this.count.max = "999";
    this.count.step = "1";
    this.count.title = "How many shifted copies Array produces";
    countRow.append(this.count);

    // Action buttons.
    const actions = el("div", "copy-actions");
    this.copyBtn = document.createElement("button");
    this.copyBtn.type = "button";
    this.copyBtn.textContent = "Copy";
    this.copyBtn.title = "Duplicate once (Enter)";
    this.copyBtn.disabled = true;
    this.copyBtn.addEventListener("click", () => this.runCopy(cb));

    this.arrayBtn = document.createElement("button");
    this.arrayBtn.type = "button";
    this.arrayBtn.textContent = "Array";
    this.arrayBtn.title = "Repeat along the offset N times (Ctrl+Enter)";
    this.arrayBtn.disabled = true;
    this.arrayBtn.addEventListener("click", () => this.runArray(cb));

    actions.append(this.copyBtn, this.arrayBtn);

    // Enter = Copy, Ctrl/Cmd+Enter = Array, from any input in the block.
    this.node.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) this.runArray(cb);
      else this.runCopy(cb);
    });

    this.node.append(
      this.target,
      modeLabel,
      this.modeSeg.node,
      this.linearBlock,
      this.polarBlock,
      countLabel,
      countRow,
      actions
    );
    this.applyMode();
    this.applyEnabled();
  }

  /** Push the live selection from App. Updates the target label + enables. */
  setSelection(sel: Selection | null, label: string): void {
    this.sel = sel;
    this.target.textContent = sel
      ? `${sel.kind === "node" ? "Node" : "Member"}: ${label}`
      : "Select a node or member first";
    this.target.classList.toggle("active", !!sel);
    this.applyEnabled();
  }

  private setMode(m: ArrayMode): void {
    this.mode = m;
    this.applyMode();
  }

  private applyMode(): void {
    this.linearBlock.classList.toggle("hidden", this.mode !== "linear");
    this.polarBlock.classList.toggle("hidden", this.mode !== "polar");
  }

  private applyEnabled(): void {
    const on = !!this.sel;
    this.copyBtn.disabled = !on;
    this.arrayBtn.disabled = !on;
  }

  private num(value: string, title: string, cls: string): HTMLInputElement {
    const i = document.createElement("input");
    i.type = "number";
    i.className = cls;
    i.value = value;
    i.step = "any";
    i.title = title;
    return i;
  }

  private offset(): { dx: number; dy: number; dz: number } {
    return {
      dx: parseFloat(this.x.value) || 0,
      dy: parseFloat(this.y.value) || 0,
      dz: parseFloat(this.z.value) || 0,
    };
  }

  private polar(): { cx: number; cy: number; angDeg: number } {
    return {
      cx: parseFloat(this.cx.value) || 0,
      cy: parseFloat(this.cy.value) || 0,
      angDeg: parseFloat(this.ang.value) || 0,
    };
  }

  private countValue(): number {
    return Math.max(1, Math.round(parseFloat(this.count.value) || 0));
  }

  private runCopy(cb: CopyArrayCallbacks): void {
    if (!this.sel) return;
    if (this.mode === "linear") {
      const { dx, dy, dz } = this.offset();
      if (dx === 0 && dy === 0 && dz === 0) return;
      cb.onCopy(dx, dy, dz);
    } else {
      const { cx, cy, angDeg } = this.polar();
      if (angDeg === 0) return;
      cb.onCopyPolar(cx, cy, angDeg);
    }
  }

  private runArray(cb: CopyArrayCallbacks): void {
    if (!this.sel) return;
    const n = this.countValue();
    if (n <= 0) return;
    if (this.mode === "linear") {
      const { dx, dy, dz } = this.offset();
      if (dx === 0 && dy === 0 && dz === 0) return;
      cb.onArray(dx, dy, dz, n);
    } else {
      const { cx, cy, angDeg } = this.polar();
      // A 0° angle means "full circle": each copy steps 360/count degrees,
      // evenly distributing copies around the pivot.
      let stepDeg = angDeg;
      if (angDeg === 0) stepDeg = 360 / Math.max(1, n);
      cb.onArrayPolar(cx, cy, stepDeg, n);
    }
  }
}
