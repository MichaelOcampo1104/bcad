import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  BcadMember,
  BcadNode,
  ModelChangeEvent,
  ProjectionMode,
  Selection,
  ViewPreset,
} from "../types";
import { Model } from "../model/Model";
import { Grid } from "./Grid";
import { Labels } from "./Labels";

const COLORS = {
  node: 0xf2c14e,
  nodeSelected: 0xffffff,
  nodeHovered: 0xff9800,
  member: 0x8ab4f8,
  memberSelected: 0xffffff,
  memberHovered: 0xff9800,
  preview: 0x00e5ff,
};

const NODE_R = 0.18;

/** Public interaction state the view should reflect (set by App). */
export interface ViewState {
  tool: string;
  projection: ProjectionMode;
  preset: ViewPreset;
  snapEnabled: boolean;
  snapSpacing: number;
  showLabels: boolean;
  showGrid: boolean;
  selection: Selection | null;
  hover: Selection | null;
  /** Two points for the in-progress line preview; null when idle. */
  linePreview: [THREE.Vector3, THREE.Vector3] | null;
  /** Where the snap indicator should sit; null when not snapping. */
  snapPoint: THREE.Vector3 | null;
}

/**
 * Owns the Three.js scene, cameras (ortho + persp), controls, the grid,
 * labels, and a thin layer of geometry that mirrors the Model.
 *
 * The view is reactive: it subscribes to Model change events and keeps its
 * meshes/labels in sync. Picking/coordinate queries are exposed as methods
 * that the ToolController calls.
 */
export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private perspCam: THREE.PerspectiveCamera;
  private orthoCam: THREE.OrthographicCamera;

  readonly controls: OrbitControls;
  private readonly grid: Grid;
  private readonly labels: Labels;

  // Entity meshes keyed by node/member id.
  private nodeMeshes = new Map<number, THREE.Mesh>();
  private memberLines = new Map<number, THREE.Line>();
  // A shared raycast target list (rebuilt as entities change).
  private pickables: THREE.Object3D[] = [];

  // Shared geometry/material for nodes (instanced via individual meshes).
  private readonly nodeGeo = new THREE.SphereGeometry(NODE_R, 16, 12);
  private readonly nodeMat = new THREE.MeshBasicMaterial({ color: COLORS.node });
  private readonly nodeMatSel = new THREE.MeshBasicMaterial({ color: COLORS.nodeSelected });
  private readonly nodeMatHov = new THREE.MeshBasicMaterial({ color: COLORS.nodeHovered });

  private readonly lineMat = new THREE.LineBasicMaterial({
    color: COLORS.member,
    linewidth: 2,
  });
  private readonly lineMatSel = new THREE.LineBasicMaterial({
    color: COLORS.memberSelected,
    linewidth: 2,
  });
  private readonly lineMatHov = new THREE.LineBasicMaterial({
    color: COLORS.memberHovered,
    linewidth: 2,
  });

  // Transient visuals for preview/snap.
  private readonly previewLine: THREE.Line;
  private readonly snapMarker: THREE.Mesh;

  private state: ViewState;
  private rafId = 0;
  private resizeObs: ResizeObserver | null = null;
  private readonly container: HTMLElement;

  constructor(private readonly model: Model, container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x15181f, 1);
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.perspCam = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
    this.perspCam.position.set(20, 18, 28);
    this.perspCam.lookAt(0, 0, 0);

    const o = 30;
    this.orthoCam = new THREE.OrthographicCamera(-o, o, o, -o, 0.1, 5000);
    this.orthoCam.position.set(0, 0, 60);
    this.orthoCam.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.perspCam, this.renderer.domElement);
    this.controls.enableRotate = true;
    this.controls.screenSpacePanning = true;

    this.grid = new Grid();
    this.scene.add(this.grid.group);

    this.labels = new Labels();
    this.labels.mount(container);

    // Preview line (hidden until a line tool action starts).
    const pGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.previewLine = new THREE.Line(
      pGeo,
      new THREE.LineDashedMaterial({
        color: COLORS.preview,
        dashSize: 0.5,
        gapSize: 0.3,
        linewidth: 2,
      })
    );
    this.previewLine.visible = false;
    this.scene.add(this.previewLine);

    this.snapMarker = new THREE.Mesh(
      new THREE.SphereGeometry(NODE_R * 1.4, 16, 12),
      new THREE.MeshBasicMaterial({
        color: COLORS.preview,
        transparent: true,
        opacity: 0.55,
      })
    );
    this.snapMarker.visible = false;
    this.scene.add(this.snapMarker);

    this.state = {
      tool: "select",
      projection: "3d",
      preset: "iso",
      snapEnabled: true,
      snapSpacing: 1,
      showLabels: true,
      showGrid: true,
      selection: null,
      hover: null,
      linePreview: null,
      snapPoint: null,
    };

    model.on((e) => this.onModelChange(e));
    this.rebuildAll();

    this.observeResize();
    this.startLoop();
  }

  // ---- public API for App ----

  setState(patch: Partial<ViewState>): void {
    const prevProj = this.state.projection;
    const prevPreset = this.state.preset;
    this.state = { ...this.state, ...patch };

    if (patch.projection && patch.projection !== prevProj) {
      this.applyProjection();
    }
    if (patch.preset && patch.preset !== prevPreset) {
      this.applyPreset();
    }
    if (patch.showGrid !== undefined) this.grid.setVisible(this.state.showGrid);
    if (patch.showLabels !== undefined) this.labels.setVisible(this.state.showLabels);

    // Visual refresh for selection/hover colors + preview.
    if (patch.selection || patch.hover) this.refreshEntityColors();
    if (patch.linePreview !== undefined) this.refreshPreview();
    if (patch.snapPoint !== undefined) this.refreshSnap();
  }

  getState(): ViewState {
    return this.state;
  }

  /** Project an NDC pointer to a world point on the active drafting plane (z=0). */
  pointerToPlane(clientX: number, clientY: number): THREE.Vector3 {
    const ndc = this.toNDC(clientX, clientY);
    const cam = this.camera;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    // Intersect the XY plane at z = currentDraftZ (default 0).
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const out = new THREE.Vector3();
    ray.ray.intersectPlane(plane, out);
    return out;
  }

  /** Raycast against pickable nodes/members. Returns first hit or null. */
  pick(clientX: number, clientY: number): Selection | null {
    const ndc = this.toNDC(clientX, clientY);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    ray.params.Line = { threshold: 0.25 };
    const hits = ray.intersectObjects(this.pickables, false);
    if (hits.length === 0) return null;
    const obj = hits[0].object;
    const nodeId = obj.userData.nodeId as number | undefined;
    if (nodeId !== undefined) return { kind: "node", id: nodeId };
    const memberId = obj.userData.memberId as number | undefined;
    if (memberId !== undefined) return { kind: "member", id: memberId };
    return null;
  }

  /** Frame selection (or whole model) in view. */
  frameSelection(sel: Selection | null): void {
    const box = new THREE.Box3();
    if (sel) {
      if (sel.kind === "node") {
        const n = this.model.getNode(sel.id);
        if (n) box.expandByPoint(new THREE.Vector3(n.x, n.y, n.z));
      } else {
        const m = this.model.getMember(sel.id);
        if (m) {
          const a = this.model.getNode(m.nodeAId);
          const b = this.model.getNode(m.nodeBId);
          if (a) box.expandByPoint(new THREE.Vector3(a.x, a.y, a.z));
          if (b) box.expandByPoint(new THREE.Vector3(b.x, b.y, b.z));
        }
      }
    }
    if (box.isEmpty()) {
      // Frame everything.
      for (const n of this.model.allNodes()) {
        box.expandByPoint(new THREE.Vector3(n.x, n.y, n.z));
      }
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const cam = this.camera;
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    if (this.state.projection === "2d") {
      cam.position.set(sphere.center.x, sphere.center.y, 60);
    } else {
      const dist = sphere.radius * 2.6 + 2;
      cam.position.copy(sphere.center).add(dir.multiplyScalar(dist));
    }
    cam.lookAt(sphere.center);
    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.parentElement?.remove();
  }

  // ---- internals ----

  private get camera(): THREE.Camera {
    return this.state.projection === "2d" ? this.orthoCam : this.perspCam;
  }

  private applyProjection(): void {
    const cam = this.state.projection === "2d" ? this.orthoCam : this.perspCam;
    this.controls.object = cam;
    // In 2D: lock rotation so it behaves like a drafting plane.
    this.controls.enableRotate = this.state.projection === "3d";
    if (this.state.projection === "2d") {
      this.orthoCam.position.copy(this.perspCam.position).setComponent(2, 60);
      this.orthoCam.lookAt(0, 0, 0);
    }
    this.controls.update();
  }

  private applyPreset(): void {
    const cam = this.camera;
    const d = 40;
    switch (this.state.preset) {
      case "top":
        cam.position.set(0, 0, d);
        this.controls.target.set(0, 0, 0);
        break;
      case "front":
        cam.position.set(0, -d, 0);
        this.controls.target.set(0, 0, 0);
        break;
      case "side":
        cam.position.set(d, 0, 0);
        this.controls.target.set(0, 0, 0);
        break;
      case "iso":
      default:
        cam.position.set(d * 0.6, -d * 0.5, d * 0.8);
        this.controls.target.set(0, 0, 0);
        break;
    }
    cam.lookAt(0, 0, 0);
    this.controls.update();
  }

  private onModelChange(e: ModelChangeEvent): void {
    switch (e.reason) {
      case "add":
      case "update":
      case "remove":
      case "clear":
      case "load":
        this.rebuildAll();
        break;
    }
  }

  /** Full rebuild of meshes + labels from the model. Simple and correct. */
  private rebuildAll(): void {
    // Clear old.
    for (const m of this.nodeMeshes.values()) {
      this.scene.remove(m);
    }
    for (const l of this.memberLines.values()) {
      this.scene.remove(l);
    }
    this.nodeMeshes.clear();
    this.memberLines.clear();
    this.pickables.length = 0;
    this.labels.clear();

    // Nodes.
    for (const n of this.model.allNodes()) this.addNodeMesh(n);
    // Members.
    for (const m of this.model.allMembers()) this.addMemberMesh(m);

    this.refreshEntityColors();
  }

  private addNodeMesh(n: BcadNode): void {
    const mesh = new THREE.Mesh(this.nodeGeo, this.nodeMat);
    mesh.position.set(n.x, n.y, n.z);
    mesh.userData.nodeId = n.id;
    this.scene.add(mesh);
    this.nodeMeshes.set(n.id, mesh);
    this.pickables.push(mesh);
    if (this.state.showLabels) {
      this.labels.set(`n${n.id}`, n.label, n.x, n.y, n.z, "node-label");
    }
  }

  private addMemberMesh(m: BcadMember): void {
    const a = this.model.getNode(m.nodeAId);
    const b = this.model.getNode(m.nodeBId);
    if (!a || !b) return;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, a.y, a.z),
      new THREE.Vector3(b.x, b.y, b.z),
    ]);
    const line = new THREE.Line(geo, this.lineMat);
    line.userData.memberId = m.id;
    this.scene.add(line);
    this.memberLines.set(m.id, line);
    this.pickables.push(line);
    if (this.state.showLabels) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const mz = (a.z + b.z) / 2;
      this.labels.set(`m${m.id}`, m.label, mx, my, mz, "member-label");
    }
  }

  private refreshEntityColors(): void {
    const { selection, hover } = this.state;
    for (const [id, mesh] of this.nodeMeshes) {
      let mat = this.nodeMat;
      if (selection?.kind === "node" && selection.id === id) mat = this.nodeMatSel;
      else if (hover?.kind === "node" && hover.id === id) mat = this.nodeMatHov;
      mesh.material = mat;
    }
    for (const [id, line] of this.memberLines) {
      let mat = this.lineMat;
      if (selection?.kind === "member" && selection.id === id) mat = this.lineMatSel;
      else if (hover?.kind === "member" && hover.id === id) mat = this.lineMatHov;
      line.material = mat;
    }
  }

  private refreshPreview(): void {
    const p = this.state.linePreview;
    if (!p) {
      this.previewLine.visible = false;
      return;
    }
    const pos = this.previewLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    pos.setXYZ(0, p[0].x, p[0].y, p[0].z);
    pos.setXYZ(1, p[1].x, p[1].y, p[1].z);
    pos.needsUpdate = true;
    this.previewLine.computeLineDistances();
    this.previewLine.visible = true;
  }

  private refreshSnap(): void {
    if (this.state.snapPoint) {
      this.snapMarker.position.copy(this.state.snapPoint);
      this.snapMarker.visible = true;
    } else {
      this.snapMarker.visible = false;
    }
  }

  private toNDC(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private observeResize(): void {
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.container);
  }

  private resize(): void {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h);
    this.labelResize(w, h);
    this.perspCam.aspect = w / h;
    this.perspCam.updateProjectionMatrix();
    const o = this.orthoView();
    this.orthoCam.left = -o * (w / h);
    this.orthoCam.right = o * (w / h);
    this.orthoCam.top = o;
    this.orthoCam.bottom = -o;
    this.orthoCam.updateProjectionMatrix();
  }

  private orthoView(): number {
    return 30;
  }

  private labelResize(w: number, h: number): void {
    this.labels.labelRenderer.setSize(w, h);
  }

  private startLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    };
    tick();
  }
}
