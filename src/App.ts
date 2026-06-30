import type { ModelChangeEvent, ProjectionMode, Selection, Tool, ViewPreset } from "./types";
import { Model } from "./model/Model";
import { SceneView } from "./render/SceneView";
import { ToolController } from "./interact/ToolController";
import { Toolbar } from "./ui/Toolbar";
import { LeftPanel } from "./ui/LeftPanel";
import { RightPanel } from "./ui/RightPanel";
import { Splitter } from "./ui/Splitter";
import { StatusBar } from "./ui/StatusBar";
import { exportCsv } from "./io/csv";
import { parseProject, saveJson } from "./io/json";

const TOOL_NAMES: Record<Tool, string> = {
  select: "Select",
  node: "Node",
  line: "Line",
  delete: "Delete",
};

/**
 * Composition root: instantiates model, view, controller, and UI panels,
 * then wires every callback. Holds the live selection + view settings so the
 * toolbar, panels, and 3D view all stay consistent.
 */
export class App {
  private model = new Model();
  private view!: SceneView;
  private tools!: ToolController;
  private toolbar!: Toolbar;
  private left!: LeftPanel;
  private right!: RightPanel;
  private status = new StatusBar();

  private selection: Selection | null = null;
  private fileInput!: HTMLInputElement;

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    const viewport = this.root.querySelector<HTMLElement>("#viewport")!;
    const toolbarEl = this.root.querySelector<HTMLElement>("#toolbar")!;
    const leftEl = this.root.querySelector<HTMLElement>("#left-panel")!;
    const rightEl = this.root.querySelector<HTMLElement>("#right-panel")!;
    const statusEl = this.root.querySelector<HTMLElement>("#statusbar")!;
    this.fileInput = this.root.querySelector<HTMLInputElement>("#file-input")!;

    // 3D view first — it owns the canvas.
    this.view = new SceneView(this.model, viewport);
    this.tools = new ToolController(this.model, this.view, this.view.renderer.domElement);

    // UI panels.
    this.toolbar = new Toolbar({
      onNew: () => this.onNew(),
      onOpen: () => this.onOpen(),
      onSave: () => saveJson(this.model),
      onExportCsv: () => exportCsv(this.model),
      onProjection: (m) => this.setProjection(m),
      onPreset: (p) => this.setPreset(p),
      onFrameAll: () => this.view.frameSelection(null),
      onSnapToggle: (v) => this.setSnap(v),
      onLabelsToggle: (v) => this.setLabels(v),
      onGridToggle: (v) => this.setGrid(v),
    });

    this.left = new LeftPanel(this.model, {
      onTool: (t) => this.setTool(t),
      onSnapSpacing: (s) => this.setSnapSpacing(s),
      onCopy: (dx, dy, dz) => this.onCopy(dx, dy, dz),
      onArray: (dx, dy, dz, count) => this.onArray(dx, dy, dz, count),
      onCopyPolar: (cx, cy, angDeg) => this.onCopyPolar(cx, cy, angDeg),
      onArrayPolar: (cx, cy, angDeg, count) => this.onArrayPolar(cx, cy, angDeg, count),
    });

    this.right = new RightPanel(this.model, {
      onSelect: (sel) => this.setSelection(sel),
      onEditNode: (id, patch) => {
        this.model.updateNode(id, patch);
      },
      onEditMember: (id, patch) => {
        this.model.updateMember(id, patch);
      },
    });

    // Mount panels.
    toolbarEl.replaceWith(this.toolbar.node);
    leftEl.replaceWith(this.left.node);
    rightEl.replaceWith(this.right.node);
    statusEl.replaceWith(this.status.node);

    // Resizable panels: drop a draggable handle between each panel and the
    // viewport. The 3D view uses a ResizeObserver, so it reflows on its own.
    const leftSplit = new Splitter(this.left.node, {
      initial: 200,
      min: 140,
      max: 600,
      direction: 1,
      label: "Resize left panel",
    });
    const rightSplit = new Splitter(this.right.node, {
      initial: 260,
      min: 160,
      max: 600,
      direction: -1,
      label: "Resize right panel",
    });
    this.left.node.after(leftSplit.node);
    this.right.node.before(rightSplit.node);

    // Initial defaults.
    this.view.setState({
      tool: "select",
      projection: "3d",
      preset: "iso",
      snapEnabled: true,
      snapSpacing: 1,
      showLabels: true,
      showGrid: true,
      selection: null,
      hover: null,
    });
    this.toolbar.setProjection("3d");
    this.toolbar.setPreset("iso");
    this.left.setTool("select");

    // Track cursor coords for the status bar.
    viewport.addEventListener("pointermove", (e) => {
      const p = this.view.pointerToPlane(e.clientX, e.clientY);
      this.status.setCoords(p.x, p.y);
    });

    // Model -> UI sync.
    this.model.on((e) => this.onModelChange(e));

    // Keyboard shortcuts.
    window.addEventListener("keydown", (e) => this.onKey(e));

    // File input for Open.
    this.fileInput.addEventListener("change", () => this.onFileChosen());

    this.refreshAll();
  }

  // ---- tool / view setters ----

  private setTool(t: Tool): void {
    this.tools.setTool(t);
    this.view.setState({ tool: t });
    this.status.setTool(TOOL_NAMES[t]);
    this.left.setTool(t);
  }

  private setProjection(m: ProjectionMode): void {
    this.view.setState({ projection: m });
    this.model.viewDefaults.projection = m;
    this.toolbar.setProjection(m);
  }

  private setPreset(p: ViewPreset): void {
    this.view.setState({ preset: p });
    this.model.viewDefaults.preset = p;
    this.toolbar.setPreset(p);
  }

  private setSnap(v: boolean): void {
    this.view.setState({ snapEnabled: v });
    this.model.viewDefaults.snapEnabled = v;
    this.status.setSnap(v);
    this.toolbar.setSnap(v);
  }

  private setSnapSpacing(s: number): void {
    this.view.setState({ snapSpacing: s });
    this.model.viewDefaults.snapSpacing = s;
  }

  private setLabels(v: boolean): void {
    this.view.setState({ showLabels: v });
    this.model.viewDefaults.showLabels = v;
    this.toolbar.setLabels(v);
  }

  private setGrid(v: boolean): void {
    this.view.setState({ showGrid: v });
    this.model.viewDefaults.showGrid = v;
    this.toolbar.setGrid(v);
  }

  private setSelection(sel: Selection | null): void {
    this.selection = sel;
    this.view.setState({ selection: sel });
    if (sel) this.view.frameSelection(sel);
    this.refreshProperties();
    this.refreshTree();
    this.left.setSelection(sel, this.selectionLabel(sel));
  }

  /** Human label for the current selection (shown in the Copy & Array block). */
  private selectionLabel(sel: Selection | null): string {
    if (!sel) return "";
    if (sel.kind === "node") {
      const n = this.model.getNode(sel.id);
      return n ? `${n.label} (${fmt(n.x)}, ${fmt(n.y)}, ${fmt(n.z)})` : "";
    }
    const m = this.model.getMember(sel.id);
    return m ? `${m.label} (${m.nodeAId}→${m.nodeBId})` : "";
  }

  // ---- copy / array ----

  private onCopy(dx: number, dy: number, dz: number): void {
    if (!this.selection) return;
    const next = this.model.copySelection(this.selection, dx, dy, dz);
    if (next) this.setSelection(next);
  }

  private onArray(dx: number, dy: number, dz: number, count: number): void {
    if (!this.selection) return;
    const next = this.model.arraySelection(this.selection, dx, dy, dz, count);
    if (next) this.setSelection(next);
  }

  private onCopyPolar(cx: number, cy: number, angDeg: number): void {
    if (!this.selection) return;
    const next = this.model.copySelectionPolar(
      this.selection,
      cx,
      cy,
      (angDeg * Math.PI) / 180
    );
    if (next) this.setSelection(next);
  }

  private onArrayPolar(cx: number, cy: number, angDeg: number, count: number): void {
    if (!this.selection) return;
    const next = this.model.arraySelectionPolar(
      this.selection,
      cx,
      cy,
      (angDeg * Math.PI) / 180,
      count
    );
    if (next) this.setSelection(next);
  }

  // ---- file ops ----

  private onNew(): void {
    if (this.model.nodeCount() + this.model.memberCount() > 0) {
      if (!confirm("Clear the current model? Unsaved changes will be lost.")) return;
    }
    this.model.clear();
    this.setSelection(null);
  }

  private onOpen(): void {
    this.fileInput.click();
  }

  private async onFileChosen(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const snap = parseProject(text);
      this.model.load(snap);
      // Restore view settings from the project.
      this.view.setState({
        projection: snap.view.projection,
        preset: snap.view.preset,
        snapEnabled: snap.view.snapEnabled,
        snapSpacing: snap.view.snapSpacing,
        showLabels: snap.view.showLabels,
        showGrid: snap.view.showGrid,
      });
      this.toolbar.setProjection(snap.view.projection);
      this.toolbar.setPreset(snap.view.preset);
      this.toolbar.setSnap(snap.view.snapEnabled);
      this.toolbar.setLabels(snap.view.showLabels);
      this.toolbar.setGrid(snap.view.showGrid);
      this.view.frameSelection(null);
    } catch (err) {
      alert(`Could not open project: ${(err as Error).message}`);
    } finally {
      this.fileInput.value = "";
    }
  }

  // ---- keyboard ----

  private onKey(e: KeyboardEvent): void {
    // Don't hijack typing in inputs.
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;

    switch (e.key) {
      case "1":
        this.setTool("select");
        break;
      case "2":
        this.setTool("node");
        break;
      case "3":
        this.setTool("line");
        break;
      case "4":
        this.setTool("delete");
        break;
      case "Delete":
      case "Backspace":
        if (this.selection) {
          this.model.removeSelection(this.selection.kind, this.selection.id);
          this.setSelection(null);
        }
        break;
      case "Escape":
        this.tools.cancelLine();
        this.setSelection(null);
        break;
    }
  }

  // ---- model change handling ----

  private onModelChange(e: ModelChangeEvent): void {
    // Keep selection valid; if it was removed, drop it (and notify the left
    // panel so the Copy & Array block disables).
    if (this.selection) {
      const sel = this.selection;
      const exists =
        (sel.kind === "node" && this.model.getNode(sel.id)) ||
        (sel.kind === "member" && this.model.getMember(sel.id));
      if (!exists) this.setSelection(null);
    }
    void e;
    this.refreshAll();
  }

  private refreshAll(): void {
    this.status.setCounts(this.model.nodeCount(), this.model.memberCount());
    this.refreshProperties();
    this.refreshTree();
  }

  private refreshProperties(): void {
    this.right.refresh(this.selection);
  }

  private refreshTree(): void {
    this.right.refresh(this.selection);
  }
}

function fmt(n: number): string {
  return parseFloat(n.toFixed(3)).toString();
}
