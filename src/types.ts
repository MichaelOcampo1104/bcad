// Core domain types for bcad.
// v1 keeps it lean: geometry + labels/tags + fixity. Structural properties
// (section/material) are deliberately out of scope for v1.

/** Whether a single degree of freedom is restrained. */
export type FixityDOF = "free" | "fixed";

/** Restraint condition for a node — which of the 6 DOFs are fixed. */
export interface NodeFixity {
  tx: FixityDOF;
  ty: FixityDOF;
  tz: FixityDOF;
  rx: FixityDOF;
  ry: FixityDOF;
  rz: FixityDOF;
}

/** Convenience presets for node fixity. "custom" means the user edited individual DOFs. */
export type NodeFixityPreset = "free" | "pinned" | "fixed" | "custom";

export const NODE_FIXITY_PRESETS: NodeFixityPreset[] = [
  "free",
  "pinned",
  "fixed",
];

/** Build a NodeFixity from a preset (or return a custom one as-is). */
export function makeNodeFixity(preset: NodeFixityPreset): NodeFixity {
  switch (preset) {
    case "free":
      return { tx: "free", ty: "free", tz: "free", rx: "free", ry: "free", rz: "free" };
    case "pinned":
      return { tx: "fixed", ty: "fixed", tz: "fixed", rx: "free", ry: "free", rz: "free" };
    case "fixed":
      return { tx: "fixed", ty: "fixed", tz: "fixed", rx: "fixed", ry: "fixed", rz: "fixed" };
    default:
      return { tx: "free", ty: "free", tz: "free", rx: "free", ry: "free", rz: "free" };
  }
}

/** Detect which preset a NodeFixity matches, or "custom" if none. */
export function detectNodeFixityPreset(f: NodeFixity): NodeFixityPreset {
  const all = [f.tx, f.ty, f.tz, f.rx, f.ry, f.rz];
  if (all.every((d) => d === "free")) return "free";
  if (f.tx === "fixed" && f.ty === "fixed" && f.tz === "fixed" && f.rx === "free" && f.ry === "free" && f.rz === "free") return "pinned";
  if (all.every((d) => d === "fixed")) return "fixed";
  return "custom";
}

/** End fixity for a member — whether moment is continuous or released. */
export type MemberEndFixity = "fixed" | "pinned";

export const MEMBER_END_FIXITY_OPTIONS: MemberEndFixity[] = ["fixed", "pinned"];

/** Fixity at both ends of a member. */
export interface MemberFixity {
  start: MemberEndFixity;
  end: MemberEndFixity;
}

/** Material type for a member. */
export type MaterialType = "concrete" | "steel" | "wood" | "aluminum" | "other";

export const MATERIAL_TYPES: MaterialType[] = [
  "concrete",
  "steel",
  "wood",
  "aluminum",
  "other",
];

/** Cross-section shape for a member. */
export type SectionShape =
  | "rectangular"
  | "circular"
  | "i_beam"
  | "hss_round"
  | "hss_rect"
  | "channel"
  | "angle"
  | "tee"
  | "other";

export const SECTION_SHAPES: SectionShape[] = [
  "rectangular",
  "circular",
  "i_beam",
  "hss_round",
  "hss_rect",
  "channel",
  "angle",
  "tee",
  "other",
];

/** A point in the model. Coordinates are in model units (unitless for v1). */
export interface BcadNode {
  id: number;
  label: string;
  x: number;
  y: number;
  z: number;
  fixity?: NodeFixity;
}

/**
 * Structural type tag for a member. Used for color-coding in the view and for
 * grouping in exports. "none" means unclassified.
 */
export type MemberTag =
  | "none"
  | "beam"
  | "column"
  | "truss"
  | "brace"
  | "cable"
  | "rafter"
  | "other";

/** All selectable member tags, in dropdown order. */
export const MEMBER_TAGS: MemberTag[] = [
  "none",
  "beam",
  "column",
  "truss",
  "brace",
  "cable",
  "rafter",
  "other",
];

/** A line element connecting two nodes. */
export interface BcadMember {
  id: number;
  label: string;
  nodeAId: number;
  nodeBId: number;
  tag: MemberTag;
  fixity?: MemberFixity;
  material?: MaterialType;
  section?: SectionShape;
}

/** What the left tool panel can be set to. */
export type Tool = "select" | "node" | "line" | "delete";

/** Orthographic view presets + a free 3D (perspective) mode. */
export type ViewPreset = "top" | "front" | "side" | "iso";

/** Viewport projection mode. "2d" = orthographic (drafting plane), "3d" = perspective. */
export type ProjectionMode = "2d" | "3d";

/** Which plane mouse clicks project onto for placement. */
export type DraftPlane = "xy" | "xz" | "yz";

/** A single selected entity reference. Exactly one of nodeId/memberId is set. */
export interface Selection {
  kind: "node" | "member";
  id: number;
}

/**
 * The live selection: a deduped, order-preserving list of entity refs.
 * Empty array = nothing selected. One entry = single selection (the common
 * case). Multiple = multi-select via modifier-click.
 */
export type SelectionSet = Selection[];

/** String key for a selection ref, handy for dedup / lookup. */
export function selKey(s: Selection): string {
  return `${s.kind}:${s.id}`;
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
    draftPlane: DraftPlane;
    planeOffset: number;
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
