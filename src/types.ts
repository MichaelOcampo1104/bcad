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

/** Which moment DOFs are released at a member end. */
export interface MemberEndRelease {
  mx: boolean;  // true = MX released (free to rotate about X)
  my: boolean;
  mz: boolean;
}

/** Convenience presets for member end fixity. */
export type MemberEndFixity = "fixed" | "pinned";

export const MEMBER_END_FIXITY_OPTIONS: MemberEndFixity[] = ["fixed", "pinned"];

/** Fixity at both ends of a member. */
export interface MemberFixity {
  start: MemberEndRelease;
  end: MemberEndRelease;
}

/** Build a MemberEndRelease where all moments are released (fully pinned). */
export function memberEndReleasePinned(): MemberEndRelease {
  return { mx: true, my: true, mz: true };
}

/** Build a MemberEndRelease where no moments are released (fully fixed). */
export function memberEndReleaseFixed(): MemberEndRelease {
  return { mx: false, my: false, mz: false };
}

/** Build a MemberEndRelease from a preset string. */
export function makeMemberEndRelease(preset: MemberEndFixity): MemberEndRelease {
  return preset === "pinned" ? memberEndReleasePinned() : memberEndReleaseFixed();
}

/** True if any moment DOF is released at this end. */
export function memberEndHasRelease(r: MemberEndRelease): boolean {
  return r.mx || r.my || r.mz;
}

/** Convert a MemberEndRelease to an array of STAAD DOF tokens that are released. */
export function memberEndReleaseToDofs(r: MemberEndRelease): string[] {
  const dofs: string[] = [];
  if (r.mx) dofs.push("MX");
  if (r.my) dofs.push("MY");
  if (r.mz) dofs.push("MZ");
  return dofs;
}

/**
 * Pick a ring color for a member end release based on which DOFs are released:
 * - all three (MX MY MZ) → green
 * - MZ only → blue
 * - any other combination → pink
 */
export function memberEndReleaseColor(r: MemberEndRelease): number {
  const count = (r.mx ? 1 : 0) + (r.my ? 1 : 0) + (r.mz ? 1 : 0);
  if (count === 3) return 0x00cc66;  // green — fully pinned
  if (count === 1 && r.mz) return 0x3399ff;  // blue — MZ only
  return 0xff66aa;  // pink — any partial combo
}

/**
 * Convert a list of STAAD DOF tokens to a MemberEndRelease.
 * Tokens should be MX/MY/MZ (case-insensitive).
 */
export function memberEndReleaseFromDofs(tokens: string[]): MemberEndRelease {
  const upper = tokens.map((t) => t.toUpperCase());
  return {
    mx: upper.includes("MX"),
    my: upper.includes("MY"),
    mz: upper.includes("MZ"),
  };
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
  /** Strength grade e.g. "C25/30", "S275", "S355". */
  materialGrade?: string;

  /** STAAD BETA angle (rotation about longitudinal axis, degrees). */
  beta?: number;
}

// ---- loads ----
//
// A load belongs to exactly one LoadCase (e.g. Dead, Live, Wind). A load
// combination sums cases with factors (1.2·DL + 1.6·LL). Three load kinds:
// nodal point forces/moments, a point force at a distance along a member, and
// a distributed load over a segment of a member.

/** Functional category for a load case. Used for grouping + export. */
export type LoadCaseType = "dead" | "live" | "wind" | "snow" | "quake" | "temperature" | "other";

export const LOAD_CASE_TYPES: LoadCaseType[] = [
  "dead",
  "live",
  "wind",
  "snow",
  "quake",
  "temperature",
  "other",
];

/** A named grouping of loads (one load case = one source of loading). */
export interface LoadCase {
  id: number;
  label: string;
  type: LoadCaseType;
}

/** Whether force components are in the global axes or the member's local axes. */
export type LoadDirection = "global" | "local";

/** Discriminator for the three load shapes. */
export type LoadKind = "nodal" | "member_point" | "member_distributed";

/** Force + moment components applied at a node. */
export interface NodalLoad {
  id: number;
  caseId: number;
  kind: "nodal";
  nodeId: number;
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
  direction: LoadDirection;
}

/** Point force at distance `dist` along a member (measured from node A). */
export interface MemberPointLoad {
  id: number;
  caseId: number;
  kind: "member_point";
  memberId: number;
  /** Distance from node A in model units (absolute, not normalized). */
  dist: number;
  fx: number;
  fy: number;
  fz: number;
  direction: LoadDirection;
}

/** Distributed load over a segment of a member (da→db from node A). */
export interface MemberDistributedLoad {
  id: number;
  caseId: number;
  kind: "member_distributed";
  memberId: number;
  /** Which component axis the distributed magnitude acts along. */
  axis: "x" | "y" | "z";
  /** Start distance from node A. */
  da: number;
  /** End distance from node A. */
  db: number;
  /** Magnitude at da. */
  wa: number;
  /** Magnitude at db. */
  wb: number;
  direction: LoadDirection;
}

/** Any single load entry. Discriminate on `kind`. */
export type BcadLoad = NodalLoad | MemberPointLoad | MemberDistributedLoad;

/** One case's contribution to a load combination. */
export interface LoadComboFactor {
  caseId: number;
  factor: number;
}

/** A load combination: a labeled sum of (case × factor) terms. */
export interface LoadCombo {
  id: number;
  label: string;
  factors: LoadComboFactor[];
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
  /** Load domain — optional so pre-load project files still open. */
  loadCases?: LoadCase[];
  loads?: BcadLoad[];
  loadCombos?: LoadCombo[];
  nextLoadCaseId?: number;
  nextLoadId?: number;
  nextLoadComboId?: number;
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
  kind?: "node" | "member" | "load" | "loadCase" | "loadCombo";
  id?: number;
}
