import { button, el, Segmented, Toggle } from "./helpers";
import type { DraftPlane, ProjectionMode, ViewPreset } from "../types";

export interface ToolbarCallbacks {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExportCsv: () => void;
  /** Export the model as a lossy STAAD .std script. */
  onExportStd: () => void;
  onProjection: (m: ProjectionMode) => void;
  onPreset: (p: ViewPreset) => void;
  onDraftPlane: (p: DraftPlane) => void;
  onPlaneOffset: (offset: number) => void;
  onPlaneLockToggle: (v: boolean) => void;
  onFrameAll: () => void;
  onSnapToggle: (v: boolean) => void;
  onLabelsToggle: (v: boolean) => void;
  onGridToggle: (v: boolean) => void;
  /** Toggle whether load arrows are drawn. */
  onLoadsToggle: (v: boolean) => void;
  /** Change which load case is shown (case id, "all", or "off"). */
  onLoadCase: (c: number | "all" | "off") => void;
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
  private lockToggle: Toggle;
  private snapToggle: Toggle;
  private labelsToggle: Toggle;
  private gridToggle: Toggle;
  private loadsToggle: Toggle;
  private loadCaseSelect: HTMLSelectElement;

  constructor(cb: ToolbarCallbacks) {
    this.node = el("header", "toolbar");
    this.node.replaceChildren();

    const brand = el("span", "brand", "bcad");
    brand.title = "bcad — 2D/3D drafting";

    const fileGroup = el("div", "tb-group");
    fileGroup.append(
      button({ text: "New", title: "Clear model", onClick: cb.onNew }),
      button({ text: "Open…", title: "Open a bcad .json, STAAD .std, or combos .py file", onClick: cb.onOpen }),
      button({ text: "Save", title: "Save project as .json", onClick: cb.onSave }),
      button({ text: "Export CSV", title: "Download nodes + members + loads as CSV", onClick: cb.onExportCsv }),
      button({ text: "Export STAAD", title: "Download model as a STAAD .std script", onClick: cb.onExportStd })
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

    // Plane lock toggle: when locked, placement is constrained to the active plane.
    // When unlocked, the Line tool can pick nodes on any plane.
    this.lockToggle = new Toggle("Lock", true, cb.onPlaneLockToggle);

    const frameBtn = button({
      text: "Frame All",
      title: "Zoom to fit everything",
      onClick: cb.onFrameAll,
    });

    const displayLabel = el("span", "tb-label", "Show");
    this.snapToggle = new Toggle("Snap", true, cb.onSnapToggle);
    this.labelsToggle = new Toggle("Labels", true, cb.onLabelsToggle);
    this.gridToggle = new Toggle("Grid", true, cb.onGridToggle);
    this.loadsToggle = new Toggle("Loads", false, cb.onLoadsToggle);

    // Load-case selector: picks which case's arrows to draw. Populated by App
    // via setLoadCases() whenever the model's cases change.
    const loadCaseLabel = el("span", "tb-label", "Case");
    this.loadCaseSelect = document.createElement("select");
    this.loadCaseSelect.className = "load-case-select";
    this.loadCaseSelect.title = "Which load case to display (loads must be shown)";
    this.loadCaseSelect.disabled = true;
    this.loadCaseSelect.addEventListener("change", () => {
      const v = this.loadCaseSelect.value;
      cb.onLoadCase(v === "all" ? "all" : v === "off" ? "off" : Number(v));
    });

    const displayGroup = el("div", "tb-group");
    displayGroup.append(
      displayLabel,
      this.snapToggle.node,
      this.labelsToggle.node,
      this.gridToggle.node,
      this.loadsToggle.node,
      loadCaseLabel,
      this.loadCaseSelect
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
      this.lockToggle.node,
      frameBtn,
      spacer,
      displayGroup
    );
  }

  setProjection(m: ProjectionMode): void {
    this.projSegmented.apply(m);
  }
  setPreset(p: ViewPreset): void {
    this.viewSegmented.apply(p);
  }
  setDraftPlane(p: DraftPlane): void {
    this.planeSegmented.apply(p);
    this.offsetLabel.textContent = OFFSET_AXIS[p];
  }
  setPlaneOffset(v: number): void {
    if (document.activeElement !== this.offsetInput) {
      this.offsetInput.value = String(v);
    }
  }
  setPlaneLocked(v: boolean): void {
    this.lockToggle.apply(v);
  }
  setSnap(v: boolean): void {
    this.snapToggle.apply(v);
  }
  setLabels(v: boolean): void {
    this.labelsToggle.apply(v);
  }
  setGrid(v: boolean): void {
    this.gridToggle.apply(v);
  }
  setLoads(v: boolean): void {
    this.loadsToggle.apply(v);
  }

  /**
   * Repopulate the load-case dropdown. `cases` drives the options; `current`
   * is the selected value (id / "all" / "off"). The dropdown enables only when
   * there's at least one case.
   */
  setLoadCases(
    cases: { id: number; label: string }[],
    current: number | "all" | "off"
  ): void {
    this.loadCaseSelect.replaceChildren();
    const off = document.createElement("option");
    off.value = "off";
    off.textContent = "Off";
    this.loadCaseSelect.appendChild(off);
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All cases";
    this.loadCaseSelect.appendChild(all);
    for (const c of cases) {
      const o = document.createElement("option");
      o.value = String(c.id);
      o.textContent = c.label;
      this.loadCaseSelect.appendChild(o);
    }
    this.loadCaseSelect.value = String(current);
    this.loadCaseSelect.disabled = cases.length === 0;
  }
}
