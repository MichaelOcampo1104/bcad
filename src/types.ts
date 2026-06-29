// Core domain types for bcad.
// v1 keeps it lean: geometry + labels/tags only. Structural properties
// (section/material/releases) are deliberately out of scope for v1.

/** A point in the model. Coordinates are in model units (unitless for v1). */
export interface BcadNode {
  id: number;
  label: string;
  x: number;
  y: number;
  z: number;
}

/** A line element connecting two nodes. */
export interface BcadMember {
  id: number;
  label: string;
  nodeAId: number;
  nodeBId: number;
}

/** What the left tool panel can be set to. */
export type Tool = "select" | "node" | "line" | "delete";

/** Orthographic view presets + a free 3D (perspective) mode. */
export type ViewPreset = "top" | "front" | "side" | "iso";

/** Viewport projection mode. "2d" = orthographic (drafting plane), "3d" = perspective. */
export type ProjectionMode = "2d" | "3d";

/** A single selected entity reference. Exactly one of nodeId/memberId is set. */
export interface Selection {
  kind: "node" | "member";
  id: number;
}

/** Snapshot of the whole model for save/load. Keep this stable across versions. */
export interface ModelSnapshot {
  version: 1;
  nodes: BcadNode[];
  members: BcadMember[];
  nextNodeId: number;
  nextMemberId: number;
  view: {
    projection: ProjectionMode;
    preset: ViewPreset;
    snapEnabled: boolean;
    snapSpacing: number;
    showLabels: boolean;
    showGrid: boolean;
  };
}

/** Event fired by the Model whenever its contents change. */
export interface ModelChangeEvent {
  /** Coarse reason so views can decide how much to rebuild. */
  reason: "add" | "update" | "remove" | "clear" | "load";
  kind?: "node" | "member";
  id?: number;
}
