import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { box, mesh, toon } from '../../engine/toon.js';

// Where the Smiths sit to watch interdimensional cable: the long mint-green
// couch, three seats between rolled arms, cushions thrown in the corners;
// and the teal armchair beside it.
//
// Origin: on the floor in the middle. Faces +z.

const FEET = '#6e4a30';

export function createCouch() {
  return sofa({
    seats: 3,
    color: '#c8e6c6',
    // Beige and dusty pink at one end, pale yellow at the other:
    // [colour, x, how far it slumps sideways].
    pillows: [
      ['#d9cfa8', -0.7, 0.12],
      ['#c99f9c', -0.35, 0.04],
      ['#e6e09a', 0.7, -0.12],
    ],
  });
}

export function createArmchair() {
  return sofa({ seats: 1, seat: 0.58, arm: 0.21, depth: 0.9, back: 0.95, color: '#3aa59e', pillows: [] });
}

/** Feet, a base, the back, rolled arms, seat and back cushions, then the pillows. */
function sofa({ seats, seat = 0.62, arm = 0.22, depth: D = 0.95, back = 0.88, color, pillows }) {
  const g = new THREE.Group();
  const cloth = toon(color);
  const inner = seats * seat;
  const W = inner + 2 * arm;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, 0.06, 0.05, FEET, sx * (W / 2 - 0.07), 0.03, sz * (D / 2 - 0.07)));
  g.add(soft(inner + 0.02, 0.24, D - 0.05, cloth, 0, 0.18, 0.02, 0.03));
  g.add(soft(W - 0.02, back - 0.06, 0.2, cloth, 0, (back + 0.06) / 2, -D / 2 + 0.1, 0.07));
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - arm / 2);
    g.add(soft(arm, 0.56, D, cloth, x, 0.34, 0, 0.07));
    // Rolled over the top, a touch wider than the arm below it.
    const roll = mesh(new THREE.CylinderGeometry(arm * 0.6, arm * 0.6, D - 0.03, 20), cloth);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(x + s * 0.015, 0.6, 0.01);
    g.add(roll);
  }
  const seatTop = 0.45;
  const lean = 0.14;
  const cushion = { y: (back + 0.42) / 2 + 0.02, z: -D / 2 + 0.28, depth: 0.17 };
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + seat * (i + 0.5);
    g.add(soft(seat - 0.02, 0.16, D - 0.27, cloth, x, seatTop - 0.08, 0.07, 0.06));
    const c = soft(seat - 0.03, back - 0.42, cushion.depth, cloth, x, cushion.y, cushion.z, 0.07);
    c.rotation.x = -lean;
    g.add(c);
  }
  // Sat on the seat, leaning back on the cushions at the same angle: where
  // the front of the back cushions meets the seat.
  const faceY = cushion.y + (cushion.depth / 2) * Math.sin(lean);
  const faceZ = cushion.z + (cushion.depth / 2) * Math.cos(lean);
  const restZ = faceZ + (faceY - seatTop) * Math.tan(lean) + 0.005;
  for (const [color, x, slump] of pillows) {
    const pillow = new THREE.Group();
    pillow.position.set(x, seatTop, restZ);
    pillow.rotation.set(-lean, 0, slump);
    pillow.add(soft(0.36, 0.34, 0.12, toon(color), 0, 0.17, 0.06, 0.06));
    g.add(pillow);
  }
  return g;
}

/** A rounded box, for the upholstery. */
function soft(w, h, d, material, x, y, z, radius) {
  const m = mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2.1, h / 2.1, d / 2.1)), material);
  m.position.set(x, y, z);
  return m;
}
