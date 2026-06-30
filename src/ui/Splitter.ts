import { el } from "./helpers";

export interface SplitterOptions {
  /** Initial width in px for the target panel. */
  initial?: number;
  /** Min width in px. */
  min?: number;
  /** Max width in px. */
  max?: number;
  /** +1 when the target sits LEFT of the handle (drag right = wider),
   *  -1 when it sits RIGHT of the handle (drag left = wider). */
  direction?: 1 | -1;
  /** Accessible label for the handle. */
  label?: string;
}

/**
 * A draggable vertical handle that resizes a neighbouring panel.
 *
 * The 3D viewport watches a ResizeObserver, so when this handle changes a
 * panel's width the canvas reflows automatically — no extra wiring is needed
 * to keep the scene in sync. Double-click resets to the initial width.
 */
export class Splitter {
  readonly node: HTMLElement;
  private readonly initial: number;
  private readonly min: number;
  private readonly max: number;
  private readonly direction: 1 | -1;
  private width: number;

  constructor(
    private readonly target: HTMLElement,
    opts: SplitterOptions = {}
  ) {
    this.initial = opts.initial ?? 200;
    this.min = opts.min ?? 140;
    this.max = opts.max ?? 600;
    this.direction = opts.direction ?? 1;
    this.width = this.clamp(this.initial);

    this.node = el("div", "splitter");
    this.node.setAttribute("role", "separator");
    this.node.setAttribute("aria-orientation", "vertical");
    if (opts.label) this.node.setAttribute("aria-label", opts.label);
    this.node.title = opts.label ?? "Drag to resize";
    this.node.tabIndex = 0;

    this.apply();
    this.node.addEventListener("pointerdown", (e) => this.onDown(e));
    this.node.addEventListener("dblclick", () => this.setWidth(this.initial));
    this.node.addEventListener("keydown", (e) => this.onKey(e));
  }

  private clamp(w: number): number {
    return Math.max(this.min, Math.min(this.max, w));
  }

  private apply(): void {
    this.target.style.width = `${this.width}px`;
    this.node.style.flexBasis = "";
  }

  private setWidth(w: number): void {
    this.width = this.clamp(w);
    this.apply();
  }

  private onDown(e: PointerEvent): void {
    // Only the primary button starts a drag.
    if (e.button !== 0) return;
    e.preventDefault();
    this.node.setPointerCapture(e.pointerId);
    this.node.classList.add("dragging");
    document.body.classList.add("splitter-dragging");

    const startX = e.clientX;
    const startW = this.width;

    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) * this.direction;
      this.setWidth(startW + delta);
    };
    const up = (ev: PointerEvent) => {
      this.node.releasePointerCapture(ev.pointerId);
      this.node.removeEventListener("pointermove", move);
      this.node.removeEventListener("pointerup", up);
      this.node.removeEventListener("pointercancel", up);
      this.node.classList.remove("dragging");
      document.body.classList.remove("splitter-dragging");
    };

    this.node.addEventListener("pointermove", move);
    this.node.addEventListener("pointerup", up);
    this.node.addEventListener("pointercancel", up);
  }

  private onKey(e: KeyboardEvent): void {
    // Arrow keys nudge the panel by 16px in the natural direction.
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      this.setWidth(this.width + this.direction * step);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      this.setWidth(this.width - this.direction * step);
    }
  }
}
