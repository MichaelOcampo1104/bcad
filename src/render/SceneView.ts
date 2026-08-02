import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  BcadMember,
  BcadNode,
  DraftPlane,
  MemberTag,
  ModelChangeEvent,
  ProjectionMode,
  Selection,
  SelectionSet,
  ViewPreset,
} from "../types";
import { selKey, detectNodeFixityPreset, nodeFixityReleaseText, memberEndHasRelease, memberEndReleaseColor } from "../types";
import { Model } from "../model/Model";
import { Grid } from "./Grid";
import { Labels } from "./Labels";
import { LoadsView } from "./LoadsView";

const COLORS = {
  node: 0xf2c14e,
  nodeSelected: 0xffffff,
  nodeHovered: 0xff9800,
  memberSelected: 0xffffff,
  memberHovered: 0xff9800,
  preview: 0x00e5ff,
};

/** Three.js plane normals for each drafting plane. */
const PLANE_NORMALS: Record<import("../types").DraftPlane, THREE.Vector3> = {
  xy: new THREE.Vector3(0, 0, 1),  // z=0
  xz: new THREE.Vector3(0, 1, 0),  // y=0
  yz: new THREE.Vector3(1, 0, 0),  // x=0
};

/** Per-tag member colors. "none" matches the original member blue. */
const TAG_COLORS: Record<MemberTag, number> = {
  none: 0x8ab4f8,
  beam: 0x4a9eff,
  column: 0x43a047,
  truss: 0xff9800,
  brace: 0xab47bc,
  cable: 0x26c6da,
  rafter: 0xef5350,
  other: 0xb0bec5,
};

const NODE_R = 0.10;

/** Public interaction state the view should reflect (set by App). */
export interface ViewState {
  tool: string;
  projection: ProjectionMode;
  preset: ViewPreset;
  draftPlane: DraftPlane;
  planeOffset: number;
  planeLocked: boolean;
  snapEnabled: boolean;
  snapSpacing: number;
  showLabels: boolean;
  showGrid: boolean;
  /** Whether entity labels are drawn. */
  showNodeLabels: boolean;
  showMemberLabels: boolean;
  /** Whether load arrows are drawn at all. */
  showLoads: boolean;
  /** Whether load value labels are shown next to arrows. */
  showLoadValues: boolean;
  /** Whether member local axes (x/y/z arrows) are drawn. */
  showLocalAxes: boolean;
  /** Which load case to show: a case id, "all", or "off". */
  visibleLoadCase: number | "all" | "off";
  /** Force→model-unit scale for load arrow lengths. */
  loadScale: number;
  /** The live multi-selection (empty = nothing selected). */
  selection: SelectionSet;
  /** The single entity under the cursor, if any. */
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
  private readonly loadsView: LoadsView;
  private readonly fixityGroup: THREE.Group;
  private readonly localAxesGroup: THREE.Group;
  private readonly elementGroup: THREE.Group;

  // Entity meshes keyed by node/member id.
  private nodeMeshes = new Map<number, THREE.Mesh>();
  private memberLines = new Map<number, THREE.Line>();
  private elementLines = new Map<number, THREE.Line>();
  // A shared raycast target list (rebuilt as entities change).
  private pickables: THREE.Object3D[] = [];

  // Shared geometry/material for nodes (instanced via individual meshes).
  private readonly nodeGeo = new THREE.SphereGeometry(NODE_R, 16, 12);
  private readonly nodeMat = new THREE.MeshBasicMaterial({ color: COLORS.node });
  private readonly nodeMatSel = new THREE.MeshBasicMaterial({ color: COLORS.nodeSelected });
  private readonly nodeMatHov = new THREE.MeshBasicMaterial({ color: COLORS.nodeHovered });

  // Member selection/hover states (base color is per-tag, set on each line).
  private readonly lineMatSel = new THREE.LineBasicMaterial({
    color: COLORS.memberSelected,
    linewidth: 2,
  });
  private readonly lineMatHov = new THREE.LineBasicMaterial({
    color: COLORS.memberHovered,
    linewidth: 2,
  });

  /** Base material for a given tag, lazily created and cached. */
  private tagMats = new Map<MemberTag, THREE.LineBasicMaterial>();
  tagMaterial(tag: MemberTag): THREE.LineBasicMaterial {
    let m = this.tagMats.get(tag);
    if (!m) {
      m = new THREE.LineBasicMaterial({ color: TAG_COLORS[tag], linewidth: 2 });
      this.tagMats.set(tag, m);
    }
    return m;
  }

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

    this.loadsView = new LoadsView(model);
    this.scene.add(this.loadsView.group);

    this.fixityGroup = new THREE.Group();
    this.scene.add(this.fixityGroup);

    this.localAxesGroup = new THREE.Group();
    this.localAxesGroup.visible = false;
    this.scene.add(this.localAxesGroup);

    this.elementGroup = new THREE.Group();
    this.scene.add(this.elementGroup);

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
      draftPlane: "xy",
      planeOffset: 0,
      planeLocked: true,
      snapEnabled: true,
      snapSpacing: 1,
      showLabels: true,
      showGrid: true,
      showNodeLabels: true,
      showMemberLabels: true,
      showLoads: false,
      showLoadValues: false,
      showLocalAxes: false,
      visibleLoadCase: "off",
      loadScale: 1,
      selection: [],
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
    const prevPlane = this.state.draftPlane;
    const prevOffset = this.state.planeOffset;
    this.state = { ...this.state, ...patch };

    if (patch.projection && patch.projection !== prevProj) {
      this.applyProjection();
    }
    if (patch.preset && patch.preset !== prevPreset) {
      this.applyPreset();
    }
    if ((patch.draftPlane && patch.draftPlane !== prevPlane) || patch.planeOffset !== prevOffset) {
      this.grid.setPlane(this.state.draftPlane, this.state.planeOffset);
    }
    if (patch.showGrid !== undefined) this.grid.setVisible(this.state.showGrid);
    if (patch.showNodeLabels !== undefined) this.labels.setNodeLabelsVisible(this.state.showNodeLabels);
    if (patch.showMemberLabels !== undefined) this.labels.setMemberLabelsVisible(this.state.showMemberLabels);

    // Load arrows: refresh when any load-view option changes.
    if (
      patch.showLoads !== undefined ||
      patch.visibleLoadCase !== undefined ||
      patch.loadScale !== undefined
    ) {
      this.refreshLoads();
    }

    // Visual refresh for selection/hover colors + preview.
    if (patch.selection || patch.hover) this.refreshEntityColors();
    if (patch.linePreview !== undefined) this.refreshPreview();
    if (patch.snapPoint !== undefined) this.refreshSnap();
  }

  getState(): ViewState {
    return this.state;
  }

  /** Project an NDC pointer to a world point on the active drafting plane. */
  pointerToPlane(clientX: number, clientY: number): THREE.Vector3 {
    const ndc = this.toNDC(clientX, clientY);
    const cam = this.camera;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    // Intersect the active drafting plane at its offset.
    const normal = PLANE_NORMALS[this.state.draftPlane];
    const plane = new THREE.Plane(normal.clone(), this.state.planeOffset);
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
    const elementId = obj.userData.elementId as number | undefined;
    if (elementId !== undefined) return { kind: "element", id: elementId };
    return null;
  }

  /** Frame a selection set (or whole model) in view. */
  frameSelection(sel: SelectionSet): void {
    const box = new THREE.Box3();
    for (const s of sel) {
      if (s.kind === "node") {
        const n = this.model.getNode(s.id);
        if (n) box.expandByPoint(new THREE.Vector3(n.x, n.y, n.z));
      } else {
        const m = this.model.getMember(s.id);
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

  /**
   * Compute a force→model-unit scale so arrows are ~12% of the model's bounding
   * size relative to the largest load magnitude, and apply it. Called after
   * model load / major changes so arrows stay legible without manual tuning.
   * Returns the computed scale.
   */
  autoScaleLoads(): number {
    let maxMag = 0;
    for (const l of this.model.allLoads()) {
      if (l.kind === "nodal") {
        maxMag = Math.max(maxMag, Math.abs(l.fx), Math.abs(l.fy), Math.abs(l.fz));
      } else if (l.kind === "member_point") {
        maxMag = Math.max(maxMag, Math.abs(l.fx), Math.abs(l.fy), Math.abs(l.fz));
      } else if (l.kind === "member_distributed") {
        maxMag = Math.max(maxMag, Math.abs(l.wa), Math.abs(l.wb));
      }
    }
    // Model extent (use nodes; fall back to a unit box if empty).
    const box = new THREE.Box3();
    for (const n of this.model.allNodes()) {
      box.expandByPoint(new THREE.Vector3(n.x, n.y, n.z));
    }
    const size = box.isEmpty() ? 10 : box.getSize(new THREE.Vector3()).length();
    const targetArrowLen = size * 0.12; // arrows ~12% of the model extent
    const scale = maxMag > 0 ? targetArrowLen / maxMag : 1;
    this.state.loadScale = scale;
    this.refreshLoads();
    return scale;
  }

  /** Rebuild fixity/release indicators from the model. */
  private refreshFixity(): void {
    // Node fixity: yellow cone for pinned, red plate for fixed, green cone
    // + release text chip for custom fixities (e.g. FIXED BUT MZ KFY 30).
    const pinGeo = new THREE.ConeGeometry(0.12, 0.18, 6);
    const fixGeo = new THREE.BoxGeometry(0.26, 0.05, 0.16); // flat rectangular plate
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 }); // yellow
    const fixMat = new THREE.MeshBasicMaterial({ color: 0xff4444 }); // red
    const customMat = new THREE.MeshBasicMaterial({ color: 0x00cc66 }); // green
    // Ring (torus) offset from the node — color-coded by which DOFs are released.
    const releaseGeo = new THREE.TorusGeometry(0.12, 0.035, 8, 12);

    // Spring indicator: diamond shape in teal for nodes with spring stiffness or subgrade
    const springGeo = new THREE.OctahedronGeometry(0.08);
    const springMat = new THREE.MeshBasicMaterial({ color: 0x00ccaa });

    for (const n of this.model.allNodes()) {
      if (!n.fixity) continue;
      const preset = detectNodeFixityPreset(n.fixity);
      if (preset === "free") continue; // explicitly free = no restraint, no marker

      let geo: THREE.BufferGeometry;
      let mat: THREE.Material;
      if (preset === "fixed") {
        geo = fixGeo;
        mat = fixMat;
      } else if (preset === "pinned") {
        geo = pinGeo;
        mat = pinMat;
      } else {
        geo = pinGeo;
        mat = customMat;
        this.labels.set(`fx${n.id}`, nodeFixityReleaseText(n.fixity),
          n.x + 0.18, n.y, n.z + 0.32, "fixity-label");
      }

      const marker = new THREE.Mesh(geo, mat);
      marker.position.set(n.x, n.y, n.z + 0.15);
      this.fixityGroup.add(marker);

      // Add a spring diamond if the node has spring stiffness or subgrade modulus.
      if (n.fixity.springs || n.fixity.subgradeModulus != null) {
        const spr = new THREE.Mesh(springGeo, springMat);
        spr.position.set(n.x + 0.15, n.y, n.z + 0.15);
        this.fixityGroup.add(spr);
      }
    }

    // Member end releases: ring markers at released ends
    for (const m of this.model.allMembers()) {
      if (!m.fixity) continue;
      const a = this.model.getNode(m.nodeAId);
      const b = this.model.getNode(m.nodeBId);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.001) continue;
      const inset = Math.min(0.3, len * 0.1);
      const ux = dx / len, uy = dy / len, uz = dz / len;
      const dirVec = new THREE.Vector3(ux, uy, uz);

      if (memberEndHasRelease(m.fixity.start)) {
        const ring = new THREE.Mesh(releaseGeo, new THREE.MeshBasicMaterial({ color: memberEndReleaseColor(m.fixity.start) }));
        ring.position.set(a.x + ux * inset, a.y + uy * inset, a.z + uz * inset);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirVec);
        this.fixityGroup.add(ring);
      }
      if (memberEndHasRelease(m.fixity.end)) {
        const ring = new THREE.Mesh(releaseGeo, new THREE.MeshBasicMaterial({ color: memberEndReleaseColor(m.fixity.end) }));
        ring.position.set(b.x - ux * inset, b.y - uy * inset, b.z - uz * inset);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirVec);
        this.fixityGroup.add(ring);
      }
    }
  }

  /** Rebuild member local-axis indicators (arrows at each member's midpoint). */
  private refreshLocalAxes(): void {
    while (this.localAxesGroup.children.length) {
      this.localAxesGroup.remove(this.localAxesGroup.children[0]);
    }

    for (const m of this.model.allMembers()) {
      const a = this.model.getNode(m.nodeAId);
      const b = this.model.getNode(m.nodeBId);
      if (!a || !b) continue;

      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.001) continue;

      const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      const localX = new THREE.Vector3(dx / len, dy / len, dz / len);

      // STAAD local-axis convention:
      //   x = along member (i→j)
      //   y = cross(z, x) where reference z = Global Z for vertical members, Global Y otherwise
      const absDotY = Math.abs(localX.dot(new THREE.Vector3(0, 1, 0)));
      const ref = absDotY > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const localZ = new THREE.Vector3().crossVectors(localX, ref).normalize();
      const localY = new THREE.Vector3().crossVectors(localZ, localX).normalize();

      const axisLen = Math.max(len * 0.3, 0.6);

      const xArr = new THREE.ArrowHelper(localX, mid, axisLen, 0x4488ff, 0.15, 0.1);
      const yArr = new THREE.ArrowHelper(localY, mid, axisLen * 0.8, 0xff4444, 0.12, 0.08);
      const zArr = new THREE.ArrowHelper(localZ, mid, axisLen * 0.8, 0x44cc44, 0.12, 0.08);
      this.localAxesGroup.add(xArr, yArr, zArr);
    }
  }

  /** Draw wireframe outlines for plate/shell elements. */
  private refreshElements(): void {
    while (this.elementGroup.children.length) {
      this.elementGroup.remove(this.elementGroup.children[0]);
    }
    this.elementLines.clear();
    const elements = this.model.allElements();
    const mat = new THREE.LineBasicMaterial({ color: 0x6688aa, transparent: true, opacity: 0.35 });
    for (const el of elements) {
      const pts: THREE.Vector3[] = [];
      for (const nid of el.nodes) {
        if (nid == null) continue;
        const n = this.model.getNode(nid);
        if (n) pts.push(new THREE.Vector3(n.x, n.y, n.z));
      }
      if (pts.length < 3) continue;
      pts.push(pts[0]);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, mat);
      line.userData.elementId = el.id;
      this.elementGroup.add(line);
      this.elementLines.set(el.id, line);
      this.pickables.push(line);
    }
  }

  /** Set whether load magnitude labels are shown. */
  setShowLoadValues(v: boolean): void {
    this.state.showLoadValues = v;
    this.refreshLoadLabels();
  }

  /** Show/hide member local axes. */
  setShowLocalAxes(v: boolean): void {
    this.state.showLocalAxes = v;
    this.localAxesGroup.visible = v;
    if (v && this.localAxesGroup.children.length === 0) this.refreshLocalAxes();
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
    this.elementLines.clear();
    this.pickables.length = 0;
    this.labels.clear();
    // Clear fixity markers
    while (this.fixityGroup.children.length) {
      const c = this.fixityGroup.children[0];
      while (c.children.length) c.remove(c.children[0]);
      if ((c as any).geometry) (c as any).geometry.dispose();
      if ((c as any).material) {
        if (Array.isArray((c as any).material)) (c as any).material.forEach((mm: any) => mm.dispose());
        else (c as any).material.dispose();
      }
      this.fixityGroup.remove(c);
    }

    // Nodes.
    for (const n of this.model.allNodes()) this.addNodeMesh(n);
    // Members.
    for (const m of this.model.allMembers()) this.addMemberMesh(m);

    this.refreshEntityColors();
    this.refreshLoads();
    this.refreshFixity();
    this.refreshLocalAxes();
    this.refreshElements();
  }

  /** Push current load-view options into LoadsView and rebuild its arrows. */
  private refreshLoads(): void {
    // `showLoads` off, or visibleCase off, means no arrows.
    const visible = this.state.showLoads ? this.state.visibleLoadCase : "off";
    this.loadsView.setOptions({
      visibleCase: visible,
      scale: this.state.loadScale,
    });
    this.loadsView.rebuild();
    this.refreshLoadLabels();
  }

  /** Add/remove load magnitude labels next to arrows. */
  private refreshLoadLabels(): void {
    // Clear previous load labels (keys starting with "ld").
    for (const key of this.labels.allKeys()) {
      if (key.startsWith("ld")) this.labels.remove(key);
    }
    if (!this.state.showLoadValues || !this.state.showLoads) return;

    const visible = this.state.visibleLoadCase;
    for (const l of this.model.allLoads()) {
      if (visible !== "all" && typeof visible === "number" && visible > 0 && l.caseId !== visible) continue;
      let text = "";
      let pos: THREE.Vector3 | null = null;
      if (l.kind === "nodal") {
        const parts: string[] = [];
        if (l.fx !== 0) parts.push(`Fx=${fmtNum(l.fx)}`);
        if (l.fy !== 0) parts.push(`Fy=${fmtNum(l.fy)}`);
        if (l.fz !== 0) parts.push(`Fz=${fmtNum(l.fz)}`);
        if (l.mx !== 0) parts.push(`Mx=${fmtNum(l.mx)}`);
        if (l.my !== 0) parts.push(`My=${fmtNum(l.my)}`);
        if (l.mz !== 0) parts.push(`Mz=${fmtNum(l.mz)}`);
        text = parts.join(" ");
        const n = this.model.getNode(l.nodeId);
        if (n) pos = new THREE.Vector3(n.x, n.y, n.z + 0.3);
      } else if (l.kind === "member_point") {
        text = `${fmtNum(l.fx || l.fy || l.fz)} @${fmtNum(l.dist)}`;
        const m = this.model.getMember(l.memberId);
        if (m) {
          const a = this.model.getNode(m.nodeAId);
          const b = this.model.getNode(m.nodeBId);
          if (a && b) {
            pos = new THREE.Vector3(
              a.x + (b.x - a.x) * l.dist,
              a.y + (b.y - a.y) * l.dist,
              a.z + (b.z - a.z) * l.dist + 0.3,
            );
          }
        }
      } else if (l.kind === "member_distributed") {
        text = `w=${fmtNum(l.wa)}→${fmtNum(l.wb)}`;
        const m = this.model.getMember(l.memberId);
        if (m) {
          const a = this.model.getNode(m.nodeAId);
          const b = this.model.getNode(m.nodeBId);
          if (a && b) {
            const mid = (l.da + l.db) / 2;
            pos = new THREE.Vector3(
              a.x + (b.x - a.x) * mid,
              a.y + (b.y - a.y) * mid,
              a.z + (b.z - a.z) * mid + 0.3,
            );
          }
        }
      } else if (l.kind === "floor") {
        text = `${fmtNum(l.magnitude)} ${l.surfaceType === "r" ? "roof" : "floor"}`;
        const midY = (l.yMin + l.yMax) / 2;
        // Place label at the center of the model at Y-level
        const nodes = this.model.allNodes();
        if (nodes.length > 0) {
          const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
          const cz = nodes.reduce((s, n) => s + n.z, 0) / nodes.length;
          pos = new THREE.Vector3(cx, midY, cz);
        }
      }
      if (text && pos) {
        this.labels.set(`ld${l.id}`, text, pos.x, pos.y, pos.z, "node-label");
      }
    }
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
    const line = new THREE.Line(geo, this.tagMaterial(m.tag));
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
    // Build a key-set once so highlight is O(1) per entity.
    const selKeys = new Set(selection.map(selKey));
    const hovKey = hover ? selKey(hover) : null;
    for (const [id, mesh] of this.nodeMeshes) {
      let mat = this.nodeMat;
      if (selKeys.has(`node:${id}`)) mat = this.nodeMatSel;
      else if (hovKey === `node:${id}`) mat = this.nodeMatHov;
      mesh.material = mat;
    }
    for (const [id, line] of this.memberLines) {
      let mat: THREE.LineBasicMaterial;
      const m = this.model.getMember(id);
      const tag = m?.tag ?? "none";
      if (selKeys.has(`member:${id}`)) mat = this.lineMatSel;
      else if (hovKey === `member:${id}`) mat = this.lineMatHov;
      else mat = this.tagMaterial(tag);
      line.material = mat;
    }
    const elMatSel = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const elMatDef = new THREE.LineBasicMaterial({ color: 0x6688aa, transparent: true, opacity: 0.35 });
    for (const [id, line] of this.elementLines) {
      line.material = selKeys.has(`element:${id}`) ? elMatSel : elMatDef;
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

/** Compact number formatting for load value labels. */
function fmtNum(n: number): string {
  if (Math.abs(n) >= 1000) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  if (Math.abs(n) >= 0.01) return n.toFixed(3);
  return n.toFixed(4);
}
