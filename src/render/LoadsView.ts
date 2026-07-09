import * as THREE from "three";
import type { BcadLoad, LoadCase } from "../types";
import type { Model } from "../model/Model";

/**
 * 3D visualization of loads as arrows. Visual-only — not pickable, not
 * editable from the 3D view (the Loads tab remains the editor).
 *
 * Drawn per load:
 *  - Nodal force (Fx/Fy/Fz): an arrow from the node along the global axis,
 *    length scaled to |magnitude|.
 *  - Nodal moment (Mx/My/Mz): a small torus arc around the node, oriented to
 *    the rotation axis.
 *  - Member point load: an arrow rooted on the member at the fractional dist.
 *  - Member distributed load: a row of small arrows along the da→db segment.
 *
 * Arrows are colored by load case (a stable palette). Magnitudes vary wildly
 * vs. geometry, so the caller passes a `scale` that maps force-units to
 * model-units; the App computes an auto-scale from the model bounding box.
 */

/** Distinct colors cycled per load case id. */
const CASE_PALETTE = [
  0xff6b6b, // red
  0x4ecdc4, // teal
  0xffe66d, // yellow
  0x95e1d3, // mint
  0xc780e8, // purple
  0xff9a3c, // orange
  0x6cc4ff, // sky
  0xf368e0, // pink
  0xa3e635, // lime
  0xfab1a0, // peach
];

export interface LoadsViewOptions {
  /** Which case to show: number = a case id, "all" = every case, "off" = none. */
  visibleCase: number | "all" | "off";
  /** Force-units → model-units scale for arrow lengths. */
  scale: number;
}

export class LoadsView {
  /** The THREE.Group holding all current arrow meshes. Add/remove this wholesale. */
  readonly group = new THREE.Group();
  private options: LoadsViewOptions = { visibleCase: "off", scale: 1 };

  constructor(private readonly model: Model) {}

  setOptions(opts: Partial<LoadsViewOptions>): void {
    this.options = { ...this.options, ...opts };
  }

  /** Color for a given load case, cycling through the palette by case id. */
  private caseColor(caseId: number): number {
    return CASE_PALETTE[Math.abs(caseId) % CASE_PALETTE.length];
  }

  /**
   * Rebuild every arrow from the model. Call after any model change or option
   * change. Disposes old meshes to avoid GPU leaks.
   */
  rebuild(): void {
    this.disposeChildren();

    const { visibleCase, scale } = this.options;
    if (visibleCase === "off" || scale <= 0) return;

    // Combo mode: visibleCase is a negative number (combo id negated).
    // Build a factor map so we multiply each referenced case's loads.
    let factorByCase: Map<number, number> | null = null;
    if (typeof visibleCase === "number" && visibleCase < 0) {
      const combo = this.model.allLoadCombos().find((c) => c.id === -visibleCase);
      if (combo) {
        factorByCase = new Map(combo.factors.map((f) => [f.caseId, f.factor]));
      } else {
        return; // combo not found — nothing to draw
      }
    }

    const cases = this.model.allLoadCases();
    const caseById = new Map(cases.map((c) => [c.id, c]));

    for (const load of this.model.allLoads()) {
      // Filter: "all" shows everything, positive number filters by case,
      // negative means combo mode (filter by combo-referenced cases).
      if (visibleCase !== "all") {
        if (typeof visibleCase === "number") {
          if (visibleCase > 0 && load.caseId !== visibleCase) continue;
          if (visibleCase < 0 && (!factorByCase || !factorByCase.has(load.caseId))) continue;
        }
      }
      if (load.kind === "floor") continue; // floor loads not drawn as arrows
      const factor = factorByCase?.get(load.caseId) ?? 1;
      const color = this.caseColor(load.caseId);
      this.addLoadArrows(load, color, scale * Math.abs(factor), caseById.get(load.caseId));
    }
  }

  /** Add the arrow(s) for a single load to the group. */
  private addLoadArrows(
    load: BcadLoad,
    color: number,
    scale: number,
    lc: LoadCase | undefined
  ): void {
    void lc;
    if (load.kind === "nodal") {
      const node = this.model.getNode(load.nodeId);
      if (!node) return;
      const origin = new THREE.Vector3(node.x, node.y, node.z);
      // One arrow per nonzero force component (global axes).
      this.addForceArrow(origin, "x", load.fx, color, scale);
      this.addForceArrow(origin, "y", load.fy, color, scale);
      this.addForceArrow(origin, "z", load.fz, color, scale);
      // Moments: a small torus around the relevant axis.
      this.addMomentArc(origin, "x", load.mx, color);
      this.addMomentArc(origin, "y", load.my, color);
      this.addMomentArc(origin, "z", load.mz, color);
      return;
    }

    // Member loads: position along the member (floor loads not drawn).
    if (load.kind === "floor") return;
    const member = this.model.getMember(load.memberId);
    if (!member) return;
    const a = this.model.getNode(member.nodeAId);
    const b = this.model.getNode(member.nodeBId);
    if (!a || !b) return;
    const pa = new THREE.Vector3(a.x, a.y, a.z);
    const pb = new THREE.Vector3(b.x, b.y, b.z);
    const len = pa.distanceTo(pb);
    if (len === 0) return;
    const dirVec = pb.clone().sub(pa).divideScalar(len); // unit along member

    if (load.kind === "member_point") {
      const at = pa.clone().add(dirVec.clone().multiplyScalar(load.dist * len));
      this.addForceArrow(at, "x", load.fx, color, scale);
      this.addForceArrow(at, "y", load.fy, color, scale);
      this.addForceArrow(at, "z", load.fz, color, scale);
    } else {
      // member_distributed: a row of arrows across da→db with interpolated magnitude.
      const dStart = load.da;
      const dEnd = load.db;
      const dRange = dEnd - dStart || 1;
      if (load.wa === 0 && load.wb === 0) return;
      const span = Math.max(0, Math.min(1, dEnd) - Math.min(1, dStart)) * len;
      const n = Math.max(2, Math.round(span / Math.max(0.5, len * 0.15)));
      for (let i = 0; i <= n; i++) {
        const frac = dStart + ((dEnd - dStart) * i) / n;
        // Interpolate magnitude: wa at da, wb at db
        const mag = load.wa + (load.wb - load.wa) * ((frac - dStart) / dRange);
        if (mag === 0) continue;
        const at = pa.clone().add(dirVec.clone().multiplyScalar(frac * len));
        this.addForceArrow(at, load.axis, mag, color, scale * 0.6);
      }
    }
  }

  /**
   * One arrow for a global-axis force component. `mag` is signed; negative
   * points opposite the axis. Length = |mag| * scale, clamped to a minimum so
   * tiny loads are still visible.
   */
  private addForceArrow(
    origin: THREE.Vector3,
    axis: "x" | "y" | "z",
    mag: number,
    color: number,
    scale: number
  ): void {
    if (mag === 0) return;
    const axisVec =
      axis === "x" ? new THREE.Vector3(1, 0, 0) :
      axis === "y" ? new THREE.Vector3(0, 1, 0) :
      new THREE.Vector3(0, 0, 1);
    const length = Math.max(0.3, Math.abs(mag) * scale);
    const sign = mag >= 0 ? 1 : -1;
    const dir = axisVec.clone().multiplyScalar(sign);
    const end = origin.clone().add(dir.clone().multiplyScalar(length));
    this.group.add(this.makeArrow(origin, end, color));
  }

  /** A small torus arc indicating a moment about an axis. */
  private addMomentArc(
    origin: THREE.Vector3,
    axis: "x" | "y" | "z",
    mag: number,
    color: number
  ): void {
    if (mag === 0) return;
    const radius = 0.45;
    const geo = new THREE.TorusGeometry(radius, 0.05, 8, 24, Math.PI * 1.5);
    const mat = new THREE.MeshBasicMaterial({ color });
    const torus = new THREE.Mesh(geo, mat);
    // Orient the torus so its hole faces along the axis.
    if (axis === "x") torus.rotation.y = Math.PI / 2;
    else if (axis === "y") torus.rotation.x = Math.PI / 2;
    // z: default already lies in the XY plane (hole faces +z).
    torus.position.copy(origin);
    // Negative moment → flip so the arc reads the other way.
    if (mag < 0) torus.scale.z = -1;
    this.group.add(torus);
  }

  /**
   * Build an arrow mesh (shaft cylinder + cone tip) from start to end. We
   * construct manually rather than THREE.ArrowHelper so the shaft has real
   * length proportional to magnitude.
   */
  private makeArrow(start: THREE.Vector3, end: THREE.Vector3, color: number): THREE.Object3D {
    const dir = end.clone().sub(start);
    const totalLen = dir.length();
    if (totalLen < 1e-6) return new THREE.Object3D();
    const tipLen = Math.min(0.4, totalLen * 0.3);
    const shaftLen = Math.max(1e-3, totalLen - tipLen);
    const shaftRadius = 0.06;
    const tipRadius = 0.16;

    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color });

    // Shaft: a cylinder of height shaftLen, translated so its base is at start
    // and it points along `dir`.
    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 10);
    shaftGeo.translate(0, shaftLen / 2, 0); // pivot at base
    const shaft = new THREE.Mesh(shaftGeo, mat);
    group.add(shaft);

    // Tip: a cone at the end of the shaft.
    const tipGeo = new THREE.ConeGeometry(tipRadius, tipLen, 12);
    tipGeo.translate(0, shaftLen + tipLen / 2, 0); // pivot at base, sitting atop shaft
    const tip = new THREE.Mesh(tipGeo, mat);
    group.add(tip);

    // Orient the group's +Y axis to `dir`, then move to start.
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.position.copy(start);
    return group;
  }

  /** Remove and dispose all child meshes (frees GPU buffers). */
  private disposeChildren(): void {
    for (const child of [...this.group.children]) {
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else if (m) m.dispose();
      });
      this.group.remove(child);
    }
  }
}
