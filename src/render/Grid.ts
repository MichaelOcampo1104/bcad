import * as THREE from "three";
import type { DraftPlane } from "../types";

/**
 * The drafting grid + world axes. Built once; toggled visible/invisible.
 * Rotates to match the active drafting plane (XY / XZ / YZ).
 */
export class Grid {
  readonly group: THREE.Group;

  private readonly gridHelper: THREE.GridHelper;
  private readonly axes: THREE.Group;

  constructor(size = 200, divisions = 200) {
    this.group = new THREE.Group();
    this.group.name = "grid";

    this.gridHelper = new THREE.GridHelper(size, divisions, 0x6688aa, 0x2a3548);
    const mat = this.gridHelper.material as THREE.Material;
    mat.transparent = true;
    mat.opacity = 0.5;
    this.gridHelper.name = "grid-helper";

    this.axes = this.buildAxes(size / 2);
    this.axes.name = "axes";

    this.group.add(this.gridHelper, this.axes);

    // Default to XY plane.
    this.setPlane("xy");
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  /** Rotate the grid to match the active drafting plane. */
  setPlane(plane: DraftPlane): void {
    switch (plane) {
      case "xy":
        // GridHelper defaults to XZ; rotate 90° around X to lie on XY (z=0).
        this.gridHelper.rotation.set(Math.PI / 2, 0, 0);
        break;
      case "xz":
        // GridHelper is already on the XZ plane (y=0) — no rotation.
        this.gridHelper.rotation.set(0, 0, 0);
        break;
      case "yz":
        // Rotate 90° around Z so the grid lies on YZ (x=0).
        this.gridHelper.rotation.set(0, 0, Math.PI / 2);
        break;
    }
  }

  private buildAxes(len: number): THREE.Group {
    const g = new THREE.Group();
    const mk = (color: number, dir: THREE.Vector3) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        dir.clone().multiplyScalar(len),
      ]);
      const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
      return new THREE.Line(geo, mat);
    };
    g.add(mk(0xe53935, new THREE.Vector3(1, 0, 0))); // X red
    g.add(mk(0x43a047, new THREE.Vector3(0, 1, 0))); // Y green
    g.add(mk(0x1e88e5, new THREE.Vector3(0, 0, 1))); // Z blue
    return g;
  }
}
