import * as THREE from "three";

/**
 * The drafting grid + world axes. Built once; toggled visible/invisible.
 * Grid lives on the XY plane (z=0) so it doubles as the 2D drafting plane.
 */
export class Grid {
  readonly group: THREE.Group;

  private readonly gridHelper: THREE.GridHelper;
  private readonly axes: THREE.Group;

  constructor(size = 200, divisions = 200, spacing = 1) {
    this.group = new THREE.Group();
    this.group.name = "grid";

    this.gridHelper = new THREE.GridHelper(size, divisions, 0x6688aa, 0x2a3548);
    // GridHelper is in the XZ plane by default; rotate it to XY (z=0).
    this.gridHelper.rotation.x = Math.PI / 2;
    const mat = this.gridHelper.material as THREE.Material;
    mat.transparent = true;
    mat.opacity = 0.5;
    this.gridHelper.name = "grid-helper";

    this.axes = this.buildAxes(size / 2);
    this.axes.name = "axes";

    this.group.add(this.gridHelper, this.axes);
    void spacing;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
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
