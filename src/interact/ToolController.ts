import type * as THREE from "three";
import type { Selection, SelectionSet, Tool } from "../types";
import { selKey } from "../types";
import type { Model } from "../model/Model";
import type { SceneView } from "../render/SceneView";
import { Snapper } from "./Snapper";

const NODE_TOL = 0.4;

/**
 * Translates mouse events into tool actions (place node, draw member, select,
 * delete). Lives on the canvas DOM element and pushes visual state into the
 * SceneView (snap marker, line preview, hover/selection).
 *
 * Selection is delegated to App via the `onSelect` callback so App stays the
 * single source of truth (viewport clicks and model-tree clicks both funnel
 * through the same path). Modifier keys drive multi-select:
 *   - plain click      → select only the clicked entity
 *   - Ctrl/Cmd+click   → toggle the clicked entity in/out of the set
 *   - click empty space→ clear the selection
 *
 * Click vs. drag: we record pointer-down position and only treat a pointer-up
 * as a "click" if it moved < 5px — so orbit/pan gestures never create nodes.
 */
export class ToolController {
  private readonly snapper: Snapper;
  private readonly el: HTMLElement;
  private readonly onSelect: (set: SelectionSet) => void;

  private downX = 0;
  private downY = 0;
  private isDown = false;
  private moved = false;

  /** First point of an in-progress line tool (world coords). */
  private lineStart: THREE.Vector3 | null = null;

  constructor(
    private readonly model: Model,
    private readonly view: SceneView,
    canvas: HTMLElement,
    onSelect: (set: SelectionSet) => void
  ) {
    this.snapper = new Snapper(model);
    this.el = canvas;
    this.onSelect = onSelect;
    this.bind();
  }

  setTool(tool: Tool): void {
    this.view.setState({ tool });
    this.cancelLine();
  }

  cancelSelection(): void {
    this.onSelect([]);
  }

  /** Abort any in-progress tool action (e.g. line midpoint). */
  cancelLine(): void {
    this.lineStart = null;
    this.view.setState({ linePreview: null });
  }

  private bind(): void {
    this.el.addEventListener("pointerdown", this.onDown);
    this.el.addEventListener("pointermove", this.onMove);
    this.el.addEventListener("pointerup", this.onUp);
    this.el.addEventListener("pointerleave", this.onLeave);
  }

  dispose(): void {
    this.el.removeEventListener("pointerdown", this.onDown);
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("pointerleave", this.onLeave);
  }

  private onDown = (e: PointerEvent): void => {
    this.isDown = true;
    this.moved = false;
    this.downX = e.clientX;
    this.downY = e.clientY;
  };

  private onMove = (e: PointerEvent): void => {
    if (this.isDown) {
      const dx = e.clientX - this.downX;
      const dy = e.clientY - this.downY;
      if (dx * dx + dy * dy > 25) this.moved = true; // >5px = drag
    }

    const tool = this.view.getState().tool;

    // Hover highlight only matters for select/delete.
    if (tool === "select" || tool === "delete") {
      const hit = this.view.pick(e.clientX, e.clientY);
      this.view.setState({ hover: hit });
    } else {
      this.view.setState({ hover: null });
    }

    // Live preview for the line tool's second point.
    if (tool === "line" && this.lineStart) {
      const snap = this.currentSnap(e);
      this.view.setState({
        linePreview: [this.lineStart, snap.point],
        snapPoint: snap.snappedToNode ? snap.point : null,
      });
    } else if (tool === "node" || tool === "line") {
      // Show snap indicator while hovering in placement tools.
      const snap = this.currentSnap(e);
      this.view.setState({ snapPoint: snap.snappedToNode ? snap.point : null });
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.isDown = false;
    if (this.moved) return; // it was an orbit/pan drag, not a click

    const tool = this.view.getState().tool;
    switch (tool) {
      case "select":
        this.doSelect(e);
        break;
      case "node":
        this.doPlaceNode(e);
        break;
      case "line":
        this.doLine(e);
        break;
      case "delete":
        this.doDelete(e);
        break;
    }
  };

  private onLeave = (): void => {
    this.view.setState({ hover: null, snapPoint: null });
  };

  private currentSnap(e: PointerEvent) {
    const st = this.view.getState();
    const raw = this.view.pointerToPlane(e.clientX, e.clientY);
    return this.snapper.snap(raw, {
      enabled: st.snapEnabled,
      spacing: st.snapSpacing,
      nodeTol: NODE_TOL,
    });
  }

  private doSelect(e: PointerEvent): void {
    const hit = this.view.pick(e.clientX, e.clientY);
    const current = this.view.getState().selection;

    if (!hit) {
      // Empty-space click clears (unless modifier held: do nothing).
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) this.onSelect([]);
      return;
    }

    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    if (additive) {
      // Toggle the clicked entity in/out of the set.
      const k = selKey(hit);
      const has = current.some((s) => selKey(s) === k);
      this.onSelect(has ? current.filter((s) => selKey(s) !== k) : [...current, hit]);
      return;
    }

    // Plain click: if the clicked entity is already the sole selection, this
    // is a no-op; otherwise it becomes the sole selection.
    if (current.length === 1 && selKey(current[0]) === selKey(hit)) return;
    this.onSelect([hit]);
    // Frame only on a fresh single selection (not on every toggle — too jumpy).
    this.view.frameSelection([hit]);
  }

  private doPlaceNode(e: PointerEvent): void {
    const snap = this.currentSnap(e);
    this.model.addNode(snap.point.x, snap.point.y, snap.point.z);
    this.view.setState({ snapPoint: null });
  }

  private doLine(e: PointerEvent): void {
    const snap = this.currentSnap(e);
    if (!this.lineStart) {
      // First click: remember start (and the node id we may reuse).
      this.lineStart = snap.point.clone();
      this.lineStartUserData = snap.nodeId ?? null;
      this.view.setState({ snapPoint: null });
      return;
    }
    // Second click: create member between the two points.
    const aNode = this.ensureNode(this.lineStart, this.lineStartUserData);
    const bNode = this.ensureNode(snap.point, snap.nodeId ?? null);
    this.model.addMember(aNode.id, bNode.id);
    this.lineStart = null;
    this.lineStartUserData = null;
    this.view.setState({ linePreview: null, snapPoint: null });
  }

  private lineStartUserData: number | null = null;

  private ensureNode(p: THREE.Vector3, existingId: number | null) {
    if (existingId !== null) {
      const n = this.model.getNode(existingId);
      if (n) return n;
    }
    return this.model.addNode(p.x, p.y, p.z);
  }

  private doDelete(e: PointerEvent): void {
    const hit = this.view.pick(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.kind === "node") this.model.removeNode(hit.id);
    else this.model.removeMember(hit.id);
    // Selection cleanup is handled centrally by App.onModelChange, which prunes
    // any selected entity that no longer exists.
  }

  /** Select a node or member directly (used by the model tree). */
  selectBy(kind: Selection["kind"], id: number): void {
    this.view.setState({ tool: "select" });
    this.onSelect([{ kind, id }]);
    this.view.frameSelection([{ kind, id }]);
  }
}
