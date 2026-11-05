/**
 * The callout engine: anchors register here (from <Anchor>), the DOM overlay (<CalloutLayer>) binds its
 * pill / leader / dot elements here, and every frame `frame()` projects the anchors and lays the pills
 * out in two edge columns (left / right of the viewport), imperatively (no React render per frame).
 *
 * Layout rules (DESIGN.md rule 4):
 *  - a pill sits on the side of the viewport its anchor is on; pills of a column are sorted by the
 *    anchors' screen y and pushed apart so they never overlap (fading pills make room gradually);
 *  - the column hugs the specimen (short leaders) but never passes its outermost anchor, never enters
 *    the right tool column and never leaves the frame;
 *  - leaders are straight, short, from the pill's inner edge to a small dot at the anchor;
 *  - the focused structure's pill is the accent pill.
 */
import { Camera, Object3D, Vector3 } from 'three';
import { KIT } from './context';

export type LabelMode = 'step' | 'all' | 'none';
export type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

export interface AnchorEntry {
  key: string;
  id: string;
  obj: Object3D | null;
  show: number;
  text?: string;
  // runtime (layout)
  alpha: number;
  side: -1 | 1;
  sx: number;
  sy: number;
  y: number;
  x: number;
  placed: boolean;
  w: number;
  h: number;
  focus: boolean;
  el: HTMLDivElement | null;
  line: SVGLineElement | null;
  dot: SVGCircleElement | null;
  target: number;
  lastStyle: string;
}

export interface EdgeTagEntry {
  key: string;
  side: EdgeSide;
  text: string;
}

/** Layout constants (px). The tool column width is reserved on the right edge. */
export const LAYOUT = {
  margin: 12,
  tools: 58,
  lead: 34,
  gap: 6,
  top: 14,
  bottom: 14,
  /** keep pills out of the top / bottom edge-tag slots when tags exist */
  tagBand: 30,
};

const damp = (a: number, b: number, lambda: number, dt: number) => (KIT.instant ? b : a + (b - a) * (1 - Math.exp(-lambda * dt)));
const tmp = new Vector3();
const camSpace = new Vector3();

export class CalloutEngine {
  entries = new Map<string, AnchorEntry>();
  tags = new Map<string, EdgeTagEntry>();
  names: Record<string, string> = {};
  mode: LabelMode = 'step';
  /** ids allowed in 'step' mode (null = all) */
  visibleIds: ReadonlySet<string> | null = null;
  focus: ReadonlySet<string> = new Set();
  version = 0;
  private listeners = new Set<() => void>();
  private colX = { left: NaN, right: NaN };
  private list: AnchorEntry[] = [];
  private left: AnchorEntry[] = [];
  private right: AnchorEntry[] = [];

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getVersion = () => this.version;
  private notify() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  label(e: { id: string; text?: string }): string {
    if (e.text) return e.text;
    const n = this.names[e.id];
    if (n) return n;
    return e.id.replace(/[-_]/g, ' ');
  }

  // ——— anchors ———
  add(key: string, id: string, obj: Object3D | null, show: number, text?: string) {
    this.entries.set(key, {
      key, id, obj, show, text,
      alpha: 0, side: 1, sx: 0, sy: 0, x: 0, y: 0, placed: false, w: 0, h: 0, focus: false,
      el: null, line: null, dot: null, target: 0, lastStyle: '',
    });
    this.notify();
  }
  update(key: string, id: string, obj: Object3D | null, show: number, text?: string) {
    const e = this.entries.get(key);
    if (!e) return this.add(key, id, obj, show, text);
    e.obj = obj;
    e.show = show;
    if (e.id !== id || e.text !== text) {
      e.id = id;
      e.text = text;
      e.w = 0;
      this.notify();
    }
  }
  remove(key: string) {
    if (this.entries.delete(key)) this.notify();
  }
  bind(key: string, part: 'el' | 'line' | 'dot', node: Element | null) {
    const e = this.entries.get(key);
    if (!e) return;
    e.lastStyle = '';
    if (part === 'el') {
      e.el = node as HTMLDivElement | null;
      e.w = 0;
    } else if (part === 'line') e.line = node as SVGLineElement | null;
    else e.dot = node as SVGCircleElement | null;
  }

  // ——— edge tags ———
  addTag(key: string, side: EdgeSide, text: string) {
    this.tags.set(key, { key, side, text });
    this.notify();
  }
  removeTag(key: string) {
    if (this.tags.delete(key)) this.notify();
  }

  setNames(names: Record<string, string>) {
    if (names !== this.names) {
      this.names = names;
      for (const e of this.entries.values()) e.w = 0;
      this.notify();
    }
  }

  /** Ids that currently have an anchor (for the shell: "all labels" etc.). */
  anchoredIds(): string[] {
    return [...new Set([...this.entries.values()].map((e) => e.id))];
  }

  /**
   * Project + lay out. Returns true while something is still moving (the caller keeps rendering).
   */
  frame(camera: Camera, w: number, h: number, dtRaw: number): boolean {
    const dt = Math.min(dtRaw, 1 / 30);
    let moving = false;
    const list = this.list;
    list.length = 0;
    const hasTop = [...this.tags.values()].some((t) => t.side === 'top');
    const hasBottom = [...this.tags.values()].some((t) => t.side === 'bottom');
    const top = LAYOUT.top + (hasTop ? LAYOUT.tagBand : 0);
    const bottom = h - LAYOUT.bottom - (hasBottom ? LAYOUT.tagBand : 0);

    for (const e of this.entries.values()) {
      let target = 0;
      if (e.obj && e.show > 0.001 && this.mode !== 'none' && (this.mode === 'all' || !this.visibleIds || this.visibleIds.has(e.id))) {
        e.obj.getWorldPosition(tmp);
        camSpace.copy(tmp).applyMatrix4(camera.matrixWorldInverse);
        if (camSpace.z < -0.05) {
          tmp.project(camera);
          e.sx = ((tmp.x + 1) / 2) * w;
          e.sy = ((1 - tmp.y) / 2) * h;
          const inside = e.sx > 4 && e.sx < w - 4 && e.sy > 4 && e.sy < h - 4;
          if (inside) target = Math.min(1, e.show);
        }
      }
      e.target = target;
      const na = damp(e.alpha, target, 9, dt);
      e.alpha = Math.abs(na - target) < 0.004 ? target : na;
      if (e.alpha !== target) moving = true;
      const f = this.focus.has(e.id);
      if (f !== e.focus) {
        e.focus = f;
        if (e.el) e.el.classList.toggle('is-focus', f);
        if (e.dot) e.dot.classList.toggle('is-focus', f);
        if (e.line) e.line.classList.toggle('is-focus', f);
      }
      if (e.alpha > 0.003) {
        if (e.el && (e.w === 0 || e.h === 0)) {
          e.w = e.el.offsetWidth;
          e.h = e.el.offsetHeight;
        }
        list.push(e);
      } else {
        e.placed = false;
        this.hide(e);
      }
    }

    // sides, with hysteresis so a label near the middle does not flip back and forth
    const left = this.left;
    const right = this.right;
    left.length = 0;
    right.length = 0;
    const mid = w / 2;
    for (const e of list) {
      if (!e.placed) e.side = e.sx < mid ? -1 : 1;
      else if (e.side === -1 && e.sx > mid + w * 0.06) e.side = 1;
      else if (e.side === 1 && e.sx < mid - w * 0.06) e.side = -1;
      (e.side === -1 ? left : right).push(e);
    }
    // a side too crowded hands its labels nearest the middle to the other side
    const need = (arr: AnchorEntry[]) => arr.reduce((a, e) => a + (e.h + LAYOUT.gap) * Math.min(1, e.alpha * 1.6), 0);
    const room = bottom - top;
    while (need(left) > room && left.length > 1 && need(right) < room) {
      left.sort((a, b) => b.sx - a.sx);
      const e = left.shift()!;
      e.side = 1;
      right.push(e);
    }
    while (need(right) > room && right.length > 1 && need(left) < room) {
      right.sort((a, b) => a.sx - b.sx);
      const e = right.shift()!;
      e.side = -1;
      left.push(e);
    }

    moving = this.column(left, -1, w, top, bottom, dt) || moving;
    moving = this.column(right, 1, w, top, bottom, dt) || moving;
    return moving;
  }

  private hide(e: AnchorEntry) {
    if (e.lastStyle === 'hidden') return;
    e.lastStyle = 'hidden';
    if (e.el) e.el.style.opacity = '0';
    if (e.line) e.line.style.opacity = '0';
    if (e.dot) e.dot.style.opacity = '0';
  }

  private column(arr: AnchorEntry[], side: -1 | 1, w: number, top: number, bottom: number, dt: number): boolean {
    if (!arr.length) return false;
    let moving = false;
    arr.sort((a, b) => a.sy - b.sy);
    // vertical: desired centre = anchor y; push apart top→bottom, then bottom→top, then clamp
    const n = arr.length;
    const ys = new Array<number>(n);
    const hs = arr.map((e) => (e.h + LAYOUT.gap) * Math.min(1, e.alpha * 1.6));
    for (let i = 0; i < n; i++) {
      const want = arr[i].sy;
      const minY = i === 0 ? top + hs[0] / 2 : ys[i - 1] + (hs[i - 1] + hs[i]) / 2;
      ys[i] = Math.max(want, minY);
    }
    for (let i = n - 1; i >= 0; i--) {
      const maxY = i === n - 1 ? bottom - hs[i] / 2 : ys[i + 1] - (hs[i] + hs[i + 1]) / 2;
      ys[i] = Math.min(ys[i], maxY);
    }
    for (let i = 0; i < n; i++) {
      const minY = i === 0 ? top + hs[0] / 2 : ys[i - 1] + (hs[i - 1] + hs[i]) / 2;
      ys[i] = Math.max(ys[i], minY);
    }
    // horizontal: one aligned column per side, hugging the outermost anchor
    const maxW = Math.max(...arr.map((e) => e.w));
    let cx: number;
    if (side === -1) {
      const minSx = Math.min(...arr.map((e) => e.sx));
      // right edge of the left column
      cx = Math.max(LAYOUT.margin + maxW, Math.min(minSx - LAYOUT.lead, w / 2 - 20));
    } else {
      const maxSx = Math.max(...arr.map((e) => e.sx));
      // left edge of the right column
      cx = Math.min(w - LAYOUT.margin - LAYOUT.tools - maxW, Math.max(maxSx + LAYOUT.lead, w / 2 + 20));
    }
    const key = side === -1 ? 'left' : 'right';
    const prev = this.colX[key];
    const nx = Number.isNaN(prev) ? cx : damp(prev, cx, 6, dt);
    if (Math.abs(nx - cx) > 0.3) moving = true;
    this.colX[key] = Math.abs(nx - cx) <= 0.3 ? cx : nx;
    const colX = this.colX[key];

    for (let i = 0; i < n; i++) {
      const e = arr[i];
      if (!e.placed) {
        e.y = ys[i];
        e.placed = true;
      } else {
        const ny = damp(e.y, ys[i], 10, dt);
        e.y = Math.abs(ny - ys[i]) < 0.25 ? ys[i] : ny;
        if (e.y !== ys[i]) moving = true;
      }
      const x0 = side === -1 ? colX - e.w : colX;
      e.x = x0;
      const edgeX = side === -1 ? colX : colX;
      const a = e.alpha;
      const style = `${x0.toFixed(1)},${e.y.toFixed(1)},${a.toFixed(3)},${e.sx.toFixed(1)},${e.sy.toFixed(1)}`;
      if (style === e.lastStyle) continue;
      e.lastStyle = style;
      if (e.el) {
        e.el.style.transform = `translate(${x0.toFixed(1)}px, ${(e.y - e.h / 2).toFixed(1)}px)`;
        e.el.style.opacity = a.toFixed(3);
      }
      // leader only when the anchor is outside the pill
      const insidePill = e.sx > x0 - 6 && e.sx < x0 + e.w + 6 && Math.abs(e.sy - e.y) < e.h / 2 + 4;
      if (e.line) {
        e.line.setAttribute('x1', edgeX.toFixed(1));
        e.line.setAttribute('y1', e.y.toFixed(1));
        e.line.setAttribute('x2', e.sx.toFixed(1));
        e.line.setAttribute('y2', e.sy.toFixed(1));
        e.line.style.opacity = insidePill ? '0' : (a * 0.9).toFixed(3);
      }
      if (e.dot) {
        e.dot.setAttribute('cx', e.sx.toFixed(1));
        e.dot.setAttribute('cy', e.sy.toFixed(1));
        e.dot.style.opacity = a.toFixed(3);
      }
    }
    return moving;
  }
}
