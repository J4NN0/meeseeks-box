import { canvasTexture } from './screens.js';

/**
 * A canvas screen you can click. Each draw() lists its clickable regions in
 * canvas pixels; picking maps a raycast's uv back onto them. Hovering one
 * redraws with it highlighted.
 *
 * An action is { id, kind, label, ... }: `id` identifies it for hovering,
 * `label` is what the crosshair says when aiming at it.
 */
export class Board {
  constructor(width, height) {
    Object.assign(this, canvasTexture(width, height));
    this.regions = [];
    this.hover = '';
    this.lastKey = '';
    this.lastArgs = null;
  }

  /** Subclasses call this from draw() with their arguments, then paint. */
  begin(key, args) {
    this.lastArgs = args;
    const full = `${key}|${this.hover}`;
    if (full === this.lastKey) return false;
    this.lastKey = full;
    this.regions = [];
    return true;
  }

  region(x, y, w, h, action) {
    this.regions.push({ x, y, w, h, action });
  }

  isHovered(action) {
    return !!this.hover && action?.id === this.hover;
  }

  /** The action under a uv coordinate (0..1, origin bottom-left), if any. */
  actionAt(uv) {
    if (!uv) return null;
    const x = uv.x * this.canvas.width;
    const y = (1 - uv.y) * this.canvas.height;
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.action;
    }
    return null;
  }

  setHover(id) {
    if (id === this.hover) return;
    this.hover = id || '';
    if (this.lastArgs) this.draw(...this.lastArgs);
  }
}
