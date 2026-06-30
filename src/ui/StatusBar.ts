import { el } from "./helpers";

/**
 * Bottom status bar: cursor coords, active tool, snap state, counts.
 */
export class StatusBar {
  readonly node: HTMLElement;
  private coords: HTMLElement;
  private toolEl: HTMLElement;
  private snapEl: HTMLElement;
  private counts: HTMLElement;

  constructor() {
    this.node = el("footer", "statusbar");
    this.coords = el("span", "sb-item", "x: —  y: —  z: —");
    this.toolEl = el("span", "sb-item", "Tool: Select");
    this.snapEl = el("span", "sb-item", "Snap: On");
    this.counts = el("span", "sb-item sb-right", "0 nodes · 0 members");
    this.node.append(this.coords, this.toolEl, this.snapEl, this.counts);
  }

  setCoords(x: number, y: number, z: number): void {
    this.coords.textContent = `x: ${x.toFixed(2)}  y: ${y.toFixed(2)}  z: ${z.toFixed(2)}`;
  }
  setTool(name: string): void {
    this.toolEl.textContent = `Tool: ${name}`;
  }
  setSnap(on: boolean): void {
    this.snapEl.textContent = `Snap: ${on ? "On" : "Off"}`;
  }
  setCounts(nodes: number, members: number): void {
    this.counts.textContent = `${nodes} node${nodes === 1 ? "" : "s"} · ${members} member${
      members === 1 ? "" : "s"
    }`;
  }
}
