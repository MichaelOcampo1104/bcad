import { button, el, Segmented, Toggle } from "./helpers";
import type { DraftPlane, ProjectionMode, ViewPreset } from "../types";

export interface ToolbarCallbacks {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExportCsv: () => void;
  onProjection: (m: ProjectionMode) => void;
  onPreset: (p: ViewPreset) => void;
  onDraftPlane: (p: DraftPlane) => void;
  onPlaneOffset: (offset: number) => void;
  onFrameAll: () => void;
  onSnapToggle: (v: boolean) => void;
  onLabelsToggle: (v: boolean) => void;
  onGridToggle: (v: boolean) => void;
}

/**
 * Top toolbar: brand, file actions, view controls, drafting plane, display toggles.
 * Pure DOM; all behavior is delegated via callbacks.
 */
/** Axis label for the plane offset input, keyed by plane. */
const OFFSET_AXIS: Record<DraftPlane, string> = { xy: "Z", xz: "Y", yz: "X" };

export class Toolbar {
  readonly node: HTMLElement;
  private projSegmented: Segmented<ProjectionMode>;
  private viewSegmented: Segmented<ViewPreset>;
  private planeSegmented: Segmented<DraftPlane>;
  private offsetLabel: HTMLElement;
  private offsetInput: HTMLInputElement;
  private snapToggle: Toggle;
  private labelsToggle: Toggle;
  private gridToggle: Toggle;

  constructor(cb: ToolbarCallbacks) {
    this.node = el("header", "toolbar");
    this.node.replaceChildren();

    const brand = el("span", "brand", "bcad");
    brand.title = "bcad — 2D/3D drafting";

    const fileGroup = el("div", "tb-group");
    fileGroup.append(
      button({ text: "New", title: "Clear model", onClick: cb.onNew }),
      button({ text: "Open…", title: "Open a .json project", onClick: cb.onOpen }),
      button({ text: "Save", title: "Save project as .json", onClick: cb.onSave }),
      button({ text: "Export CSV", title: "Download nodes + members as CSV", onClick: cb.onExportCsv })
    );

    const viewLabel = el("span", "tb-label", "View");
    this.viewSegmented = new Segmented<ViewPreset>(
      [
        { value: "top", label: "Top", title: "Top view" },
        { value: "front", label: "Front", title: "Front view" },
        { value: "side", label: "Side", title: "Side view" },
        { value: "iso", label: "Iso", title: "Isometric view" },
      ],
      cb.onPreset
    );

    const projLabel = el("span", "tb-label", "Mode");
    this.projSegmented = new Segmented<ProjectionMode>(
      [
        { value: "2d", label: "2D", title: "Orthographic drafting plane" },
        { value: "3d", label: "3D", title: "Perspective orbit" },
      ],
      cb.onProjection
    );

    const planeLabel = el("span", "tb-label", "Plane");
    this.planeSegmented = new Segmented<DraftPlane>(
      [
        { value: "xy", label: "XY", title: "Draw on XY plane (top-down)" },
        { value: "xz", label: "XZ", title: "Draw on XZ plane (front elevation)" },
        { value: "yz", label: "YZ", title: "Draw on YZ plane (side elevation)" },
      ],
      (p) => {
        cb.onDraftPlane(p);
        this.offsetLabel.textContent = OFFSET_AXIS[p];
      }
    );

    // Plane offset input: dynamically labeled by the active plane's normal axis.
    this.offsetLabel = el("span", "tb-label", "Z");
    this.offsetInput = document.createElement("input");
    this.offsetInput.type = "number";
    this.offsetInput.className = "plane-offset-input";
    this.offsetInput.value = "0";
    this.offsetInput.step = "0.5";
    this.offsetInput.title = "Offset the drafting plane along its normal axis";
    this.offsetInput.addEventListener("change", () => {
      const v = parseFloat(this.offsetInput.value);
      if (Number.isFinite(v)) cb.onPlaneOffset(v);
    });
    this.offsetInput.addEventListener("input", () => {
      const v = parseFloat(this.offsetInput.value);
      if (Number.isFinite(v)) cb.onPlaneOffset(v);
    });

    const frameBtn = button({
      text: "Frame All",
      title: "Zoom to fit everything",
      onClick: cb.onFrameAll,
    });

    const displayLabel = el("span", "tb-label", "Show");
    this.snapToggle = new Toggle("Snap", true, cb.onSnapToggle);
    this.labelsToggle = new Toggle("Labels", true, cb.onLabelsToggle);
    this.gridToggle = new Toggle("Grid", true, cb.onGridToggle);

    const displayGroup = el("div", "tb-group");
    displayGroup.append(
      displayLabel,
      this.snapToggle.node,
      this.labelsToggle.node,
      this.gridToggle.node
    );

    const spacer = el("div", "tb-spacer");

    this.node.append(
      brand,
      fileGroup,
      viewLabel,
      this.viewSegmented.node,
      projLabel,
      this.projSegmented.node,
      planeLabel,
      this.planeSegmented.node,
      this.offsetLabel,
      this.offsetInput,
      frameBtn,
      spacer,
      displayGroup
    );
  }

  setProjection(m: ProjectionMode): void {
    this.projSegmented.set(m);
  }
  setPreset(p: ViewPreset): void {
    this.viewSegmented.set(p);
  }
  setDraftPlane(p: DraftPlane): void {
    this.planeSegmented.set(p);
    this.offsetLabel.textContent = OFFSET_AXIS[p];
  }
  setPlaneOffset(v: number): void {
    if (document.activeElement !== this.offsetInput) {
      this.offsetInput.value = String(v);
    }
  }
  setSnap(v: boolean): void {
    this.snapToggle.set(v);
  }
  setLabels(v: boolean): void {
    this.labelsToggle.set(v);
  }
  setGrid(v: boolean): void {
    this.gridToggle.set(v);
  }
}
