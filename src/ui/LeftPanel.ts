import { el, Segmented } from "./helpers";
import type { SelectionSet, Tool } from "../types";
import type { Model } from "../model/Model";
import { NodeGrid } from "./NodeGrid";
import { MemberGrid } from "./MemberGrid";
import { CopyArray } from "./CopyArray";
import { LoadsPanel } from "./LoadsPanel";
import { CombosPanel } from "./CombosPanel";

export interface LeftPanelCallbacks {
  onTool: (t: Tool) => void;
  onSnapSpacing: (spacing: number) => void;
  onCopy: (dx: number, dy: number, dz: number) => void;
  onArray: (dx: number, dy: number, dz: number, count: number) => void;
  onCopyPolar: (cx: number, cy: number, angDeg: number) => void;
  onArrayPolar: (cx: number, cy: number, angDeg: number, count: number) => void;
}

/** Which data tab is visible in the left panel's scroll section. */
type DataTab = "nodes" | "members" | "loads" | "combos";

/**
 * Left tool rail: tool selector, snap spacing, a Copy & Array command block,
 * and a tabbed data section ([Nodes] [Members] [Loads] [Combos]).
 *
 * Everything is reactive: the grids/panels reflect whatever is in the Model,
 * whether the entity was typed here, drawn with the mouse, copied, or loaded
 * from a file. The Copy & Array block mirrors the live selection coming from App.
 */
export class LeftPanel {
  readonly node: HTMLElement;
  private tools: Segmented<Tool>;
  private dataTabs: Segmented<DataTab>;
  private tabPanels = new Map<DataTab, HTMLElement>();

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

    // ---- Tabbed data section ----
    //
    // Nodes + Members keep their full spreadsheet editors; Loads + Combos get
    // their own panels. Only the active tab's panel is shown; switching just
    // toggles display (the grids stay mounted so their reconcile listeners
    // keep working while hidden).
    const dataTitle = el("div", "panel-title", "Data");
    this.dataTabs = new Segmented<DataTab>(
      [
        { value: "nodes", label: "Nodes", title: "Node coordinates" },
        { value: "members", label: "Members", title: "Members between nodes" },
        { value: "loads", label: "Loads", title: "Loads on nodes/members" },
        { value: "combos", label: "Combos", title: "Load combinations" },
      ],
      (t) => this.setTab(t)
    );

    // Nodes panel.
    const nodesPanel = el("div", "tab-panel");
    nodesPanel.append(
      el("div", "grid-hint", "X/Y/Z. Enter moves down. Nodes from the mouse also appear here.")
    );
    nodesPanel.append(new NodeGrid(model).node);

    // Members panel.
    const membersPanel = el("div", "tab-panel");
    membersPanel.append(
      el("div", "grid-hint", "Node A & B ids + tag. Lines drawn with the mouse appear here too.")
    );
    membersPanel.append(new MemberGrid(model).node);

    // Loads + Combos panels.
    const loadsPanel = el("div", "tab-panel");
    loadsPanel.append(new LoadsPanel(model).node);
    const combosPanel = el("div", "tab-panel");
    combosPanel.append(new CombosPanel(model).node);

    this.tabPanels.set("nodes", nodesPanel);
    this.tabPanels.set("members", membersPanel);
    this.tabPanels.set("loads", loadsPanel);
    this.tabPanels.set("combos", combosPanel);

    const tabPanelsWrap = el("div", "tab-panels");
    tabPanelsWrap.append(nodesPanel, membersPanel, loadsPanel, combosPanel);

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

    // Fixed top section: tools, snap, copy/array, data tabs — always visible.
    const fixedSection = el("div", "left-panel-fixed");
    fixedSection.append(
      title,
      this.tools.node,
      snapTitle,
      spacingWrap,
      copyTitle,
      this.copyArray.node,
      dataTitle,
      this.dataTabs.node,
    );

    // Scrollable bottom section: tab content panels + help.
    const scrollSection = el("div", "left-panel-scroll");
    scrollSection.append(tabPanelsWrap, help);

    this.node.append(fixedSection, scrollSection);

    // Show the Nodes panel by default.
    this.applyTab("nodes");
  }

  private copyArray: CopyArray;

  setTool(t: Tool): void {
    this.tools.apply(t);
  }

  /** Switch the visible data tab (tabs themselves come from the Segmented control). */
  private setTab(t: DataTab): void {
    this.applyTab(t);
  }

  /** Toggle panel visibility without re-emitting the segmented selection. */
  private applyTab(t: DataTab): void {
    for (const [key, panel] of this.tabPanels) {
      panel.style.display = key === t ? "" : "none";
    }
  }

  /** Push the live selection so the Copy & Array block reflects + enables. */
  setSelection(sel: SelectionSet, label: string): void {
    this.copyArray.setSelection(sel, label);
  }
}
