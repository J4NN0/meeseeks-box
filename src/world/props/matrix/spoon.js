import * as THREE from 'three';
import { box, mesh, toon } from '../../../engine/toon.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundedRect } from '../shapes.js';

// The spoon (The Matrix): a plain round soup spoon like the one the spoon
// boy hands Neo at the Oracle's, bent at the neck as if someone just
// realised the truth (there is no spoon). Two ways to show it: standing in
// a little black base on a surface (`mount: 'stand'`), or clipped upright to
// a wall or the pegboard (`mount: 'board'`), its bowl bending out towards
// you.
//
// Origin: on a stand, the bottom of the base; on a board, the middle of its
// back. Faces +z.

const STEEL = '#aeb7c3';
const BASE = { width: 0.085, depth: 0.045, height: 0.02 };
const SCALE = 1.15;

// Along the spoon from the end of the handle: where it narrows into the
// neck, the bowl (centre, half length, half width, depth), and where and how
// tightly it bends.
const HANDLE = 0.13;
const LENGTH = 0.2;
const BOWL = { at: 0.1725, half: 0.0275, wide: 0.021, depth: 0.008 };
const BEND = { at: 0.122, radius: 0.022 };

export function createSpoon({ mount = 'stand' } = {}) {
  return mount === 'board' ? onBoard() : onStand();
}

function onStand() {
  const g = new THREE.Group();
  g.add(base());
  // Bent back, away from the hollow of the bowl.
  const spoon = mesh(spoonGeometry(-1, 1.2), toon(STEEL, { side: THREE.DoubleSide }));
  // Sunk into the slot in the base, and turned so you see the bend side on.
  spoon.position.y = BASE.height - 0.014;
  spoon.rotation.y = -0.6;
  spoon.scale.setScalar(SCALE);
  g.add(spoon);
  return g;
}

function onBoard() {
  const g = new THREE.Group();
  // Bent forwards, so from below you look up into the bowl.
  const spoon = mesh(spoonGeometry(1, 0.95), toon(STEEL, { side: THREE.DoubleSide }));
  const bottom = -0.1;
  spoon.position.set(0, bottom, 0.012);
  spoon.scale.setScalar(SCALE);
  g.add(spoon);
  // Two black clips over the handle, pegged into the board.
  const black = toon('#17181b');
  for (const t of [0.035, 0.095]) {
    const y = bottom + t * SCALE;
    const half = (width(t) * SCALE) / 2 + 0.005;
    g.add(box(half * 2 + 0.004, 0.007, 0.004, black, 0, y, 0.0205));
    for (const side of [-1, 1]) g.add(box(0.004, 0.007, 0.0205, black, side * half, y, 0.0103));
  }
  return g;
}

/** How wide the spoon is `t` along it. */
function width(t) {
  const end = 0.011;
  if (t < end) return 0.022 * Math.sqrt(Math.max(0, 1 - ((end - t) / end) ** 2));
  const handle = t < HANDLE ? 0.022 + (0.008 - 0.022) * ((t - end) / (HANDLE - end)) ** 0.8 : 0.008;
  const k = (t - BOWL.at) / BOWL.half;
  const bowl = Math.abs(k) < 1 ? 2 * BOWL.wide * Math.sqrt(1 - k * k) : 0;
  return t > BOWL.at ? bowl : Math.max(handle, bowl);
}

/**
 * A thin sheet in the spoon's outline, hollowed into a bowl (facing +z) at
 * the top and bent `angle` along an arc from BEND.at: towards the hollow
 * (`toward` 1) or away from it (-1).
 */
function spoonGeometry(toward, angle) {
  const along = 90;
  const across = 10;
  const geo = new THREE.PlaneGeometry(1, 1, across, along);
  const pos = geo.attributes.position;
  const { at: t0, radius: R } = BEND;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const t = (pos.getY(i) + 0.5) * LENGTH;
    const x = u * width(t);
    // Hollow facing +z in the bowl; the handle arches a touch.
    const k = (t - BOWL.at) / BOWL.half;
    const hollow = 1 - (x / BOWL.wide) ** 2 - k * k;
    let dz = -BOWL.depth * Math.max(0, hollow) + (t < HANDLE ? 0.003 * Math.sin((Math.PI * t) / HANDLE) : 0);
    // The bend: up an arc, then straight on.
    let y = t;
    let z = 0;
    let phi = 0;
    if (t > t0) {
      const s = t - t0;
      phi = Math.min(s / R, angle);
      y = t0 + R * Math.sin(phi);
      z = toward * R * (1 - Math.cos(phi));
      const rest = s - phi * R;
      if (rest > 0) {
        y += rest * Math.cos(angle);
        z += toward * rest * Math.sin(angle);
      }
    }
    // The hollow follows the bend round.
    pos.setXYZ(i, x, y - toward * dz * Math.sin(phi), z + dz * Math.cos(phi));
  }
  geo.computeVertexNormals();
  return thicken(geo, across, along, 0.0035);
}

/**
 * The sheet made solid, `depth` thick: a back pushed in along the normals
 * and walls down both long edges (the ends taper to nothing), so it still
 * reads side on.
 */
function thicken(front, across, along, depth) {
  const back = front.clone();
  const p = back.attributes.position;
  const n = front.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * depth, p.getY(i) - n.getY(i) * depth, p.getZ(i) - n.getZ(i) * depth);
  const at = (i, j) => j * (across + 1) + i;
  const walls = [];
  const corner = (g, k) => [g.attributes.position.getX(k), g.attributes.position.getY(k), g.attributes.position.getZ(k)];
  for (const i of [0, across]) {
    for (let j = 0; j < along; j++) {
      const [a, b] = [at(i, j), at(i, j + 1)];
      walls.push(...corner(front, a), ...corner(front, b), ...corner(back, b), ...corner(front, a), ...corner(back, b), ...corner(back, a));
    }
  }
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((walls.length / 3) * 2), 2));
  sides.computeVertexNormals();
  return mergeGeometries([front.toNonIndexed(), back.toNonIndexed(), sides]);
}

function base() {
  const g = new THREE.Group();
  const { width: w, depth: d, height: h } = BASE;
  const block = new THREE.ExtrudeGeometry(roundedRect(w - 0.004, d - 0.004, 0.006), { depth: h - 0.004, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 4 });
  block.rotateX(-Math.PI / 2);
  block.translate(0, 0.002, 0);
  g.add(mesh(block, toon('#17181b')));
  return g;
}
