import type * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

/**
 * Manages HTML labels overlaid on the 3D scene via CSS2DRenderer.
 * Labels are div elements positioned at world points each frame — they
 * don't rotate with the scene and stay crisp at any zoom.
 */
export class Labels {
  readonly labelRenderer: CSS2DRenderer;
  private readonly layer = document.createElement("div");

  /** id(objName) -> CSS2DObject so we can update/remove per-entity labels. */
  private objects = new Map<string, CSS2DObject>();

  constructor() {
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = "absolute";
    this.labelRenderer.domElement.style.top = "0";
    this.labelRenderer.domElement.style.left = "0";
    this.labelRenderer.domElement.style.pointerEvents = "none";
    // The overlay layer holds only labels.
    this.layer.className = "label-layer";
    this.layer.appendChild(this.labelRenderer.domElement);
  }

  /** Append the label DOM layer to a parent (the viewport container). */
  mount(parent: HTMLElement): void {
    parent.appendChild(this.layer);
  }

  get domElement(): HTMLElement {
    return this.labelRenderer.domElement;
  }

  private showNodes = true;
  private showMembers = true;
  private showFixityText = true;

  setVisible(v: boolean): void {
    this.layer.style.display = v ? "" : "none";
    if (v === false) { this.showNodes = false; this.showMembers = false; }
  }

  setNodeLabelsVisible(v: boolean): void { this.showNodes = v; this.updateVisibility(); }
  setMemberLabelsVisible(v: boolean): void { this.showMembers = v; this.updateVisibility(); }
  /** Toggle release-text chips on custom fixity cones ("fx" keys). */
  setFixityTextVisible(v: boolean): void { this.showFixityText = v; this.updateVisibility(); }

  private updateVisibility(): void {
    for (const [key, obj] of this.objects) {
      if (key.startsWith("n")) obj.visible = this.showNodes;
      else if (key.startsWith("m")) obj.visible = this.showMembers;
      else if (key.startsWith("fx")) obj.visible = this.showFixityText;
    }
  }

  /** Set or update a label for an entity at a world position. */
  set(key: string, text: string, x: number, y: number, z: number, cls = ""): void {
    let obj = this.objects.get(key);
    const div = document.createElement("div");
    div.className = `entity-label ${cls}`.trim();
    div.textContent = text;
    if (obj) {
      // Replace the element content + position.
      obj.element.remove();
      obj.element = div;
      obj.position.set(x, y, z);
    } else {
      obj = new CSS2DObject(div);
      obj.position.set(x, y, z);
      this.objects.set(key, obj);
    }
  }

  remove(key: string): void {
    const obj = this.objects.get(key);
    if (!obj) return;
    obj.removeFromParent();
    obj.element.remove();
    this.objects.delete(key);
  }

  /** Return all current label keys for iteration. */
  allKeys(): string[] {
    return [...this.objects.keys()];
  }

  /** Hand the scene's label objects to the renderer each frame. */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    for (const [key, obj] of this.objects) {
      if (!obj.parent) scene.add(obj);
      if (key.startsWith("n")) obj.visible = this.showNodes;
      else if (key.startsWith("m")) obj.visible = this.showMembers;
      else if (key.startsWith("fx")) obj.visible = this.showFixityText;
      else obj.visible = true;
    }
    this.labelRenderer.render(scene, camera);
  }

  clear(): void {
    for (const [key, obj] of this.objects) {
      obj.removeFromParent();
      obj.element.remove();
      this.objects.delete(key);
    }
  }
}
