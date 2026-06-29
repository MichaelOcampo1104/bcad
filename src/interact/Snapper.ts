import * as THREE from "three";
import type { Model } from "../model/Model";

export interface SnapResult {
  point: THREE.Vector3;
  /** If snapping landed on an existing node, its id (for dedup). */
  nodeId?: number;
  snappedToNode: boolean;
}

/**
 * Snaps a raw world point to (1) an existing node within tolerance, else
 * (2) the grid, else (3) the raw point unchanged.
 */
export class Snapper {
  constructor(private readonly model: Model) {}

  snap(
    raw: THREE.Vector3,
    opts: { enabled: boolean; spacing: number; nodeTol: number }
  ): SnapResult {
    // 1) Node priority — land exactly on an existing node.
    const near = this.model.findNodeNear(raw.x, raw.y, raw.z, opts.nodeTol);
    if (near) {
      return {
        point: new THREE.Vector3(near.x, near.y, near.z),
        nodeId: near.id,
        snappedToNode: true,
      };
    }
    // 2) Grid.
    let p = raw.clone();
    if (opts.enabled && opts.spacing > 0) {
      p = new THREE.Vector3(
        Math.round(raw.x / opts.spacing) * opts.spacing,
        Math.round(raw.y / opts.spacing) * opts.spacing,
        Math.round(raw.z / opts.spacing) * opts.spacing
      );
    }
    return { point: p, snappedToNode: false };
  }
}
