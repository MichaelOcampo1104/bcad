/** Small DOM helpers used by the UI builders. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface ButtonOptions {
  title?: string;
  cls?: string;
  text?: string;
  onClick?: () => void;
}

export function button({ title, cls, text, onClick }: ButtonOptions): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  if (title) b.title = title;
  if (cls) b.className = cls;
  if (text !== undefined) b.textContent = text;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

/** A labeled toggle that reflects on/off state via the `active` class. */
export class Toggle {
  readonly node: HTMLButtonElement;
  private on = false;

  constructor(
    label: string,
    initialState: boolean,
    private readonly onChange: (v: boolean) => void
  ) {
    this.node = button({
      text: label,
      cls: "tb-toggle",
    });
    this.node.addEventListener("click", () => this.set(!this.on));
    this.set(initialState);
  }

  set(v: boolean): void {
    this.on = v;
    this.node.classList.toggle("active", v);
    this.onChange(v);
  }

  get value(): boolean {
    return this.on;
  }
}

/** A group of mutually-exclusive buttons (e.g. tools or view presets). */
export class Segmented<T extends string> {
  readonly node: HTMLElement;
  private current: T | null = null;
  private buttons = new Map<T, HTMLButtonElement>();

  constructor(
    options: { value: T; label: string; title?: string }[],
    private readonly onSelect: (v: T) => void
  ) {
    this.node = el("div", "segmented");
    for (const opt of options) {
      const b = button({ text: opt.label, title: opt.title, cls: "seg-btn" });
      b.addEventListener("click", () => this.set(opt.value));
      this.buttons.set(opt.value, b);
      this.node.appendChild(b);
    }
  }

  set(v: T): void {
    this.current = v;
    for (const [value, b] of this.buttons) {
      b.classList.toggle("active", value === v);
    }
    this.onSelect(v);
  }

  get value(): T | null {
    return this.current;
  }
}
