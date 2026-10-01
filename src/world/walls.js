import * as THREE from 'three';
import { box, mesh } from '../engine/toon.js';

// Building bits the rooms share: the garage, the living room, the spare room.

/** Walls are this thick. */
export const T = 0.3;

export const NO_SHADOW = { cast: false, receive: true };

export function extrude(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
}

/** A box with a material per face: +x, -x, +y, -y, +z, -z. */
export function slab(w, h, d, materials, x, y, z, opts) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), materials, opts);
  m.position.set(x, y, z);
  return m;
}

/**
 * The band round an arch, `inner` to `outer` from its middle, from the floor
 * up one side, over the top and down the other: its trim, or its lining.
 */
export function archRing({ x, spring }, inner, outer) {
  const s = new THREE.Shape();
  s.moveTo(x - outer, 0);
  s.lineTo(x - outer, spring);
  s.absarc(x, spring, outer, Math.PI, 0, true);
  s.lineTo(x + outer, 0);
  s.lineTo(x + inner, 0);
  s.lineTo(x + inner, spring);
  s.absarc(x, spring, inner, 0, Math.PI, false);
  s.closePath();
  return s;
}

/** A wall `length` long along x, centred on 0, with rectangular `holes` in it. */
export function openWall(length, height, holes, material) {
  const g = new THREE.Group();
  const part = (a, b, y0, y1) => {
    if (b - a > 0.001 && y1 - y0 > 0.001) g.add(box(b - a, y1 - y0, T, material, (a + b) / 2, (y0 + y1) / 2, 0, NO_SHADOW));
  };
  let from = -length / 2;
  for (const h of [...holes].sort((a, b) => a.at - b.at)) {
    part(from, h.at - h.width / 2, 0, height);
    part(h.at - h.width / 2, h.at + h.width / 2, 0, h.bottom);
    part(h.at - h.width / 2, h.at + h.width / 2, h.top, height);
    from = h.at + h.width / 2;
  }
  part(from, length / 2, 0, height);
  return g;
}

/** A frame round a hole in an openWall: a sill and a cross if it's a window, one upright if it's a door. */
export function windowFrame(g, { at, width, bottom, top }, color, isWindow) {
  const mid = (bottom + top) / 2;
  for (const s of [-1, 1]) g.add(box(0.07, top - bottom, T + 0.04, color, at + s * (width / 2 - 0.035), mid, 0, NO_SHADOW));
  g.add(box(width, 0.07, T + 0.04, color, at, top - 0.035, 0, NO_SHADOW));
  g.add(box(0.06, top - bottom, 0.1, color, at, mid, 0, NO_SHADOW));
  if (isWindow) {
    g.add(box(width + 0.16, 0.06, T + 0.16, color, at, bottom + 0.03, 0, NO_SHADOW));
    g.add(box(width, 0.06, 0.1, color, at, mid + 0.15, 0, NO_SHADOW));
  } else {
    // The handle on the sliding half.
    g.add(box(0.03, 0.3, 0.05, '#5d646e', at - 0.12, 1.05, -T / 2 - 0.02, NO_SHADOW));
  }
}
