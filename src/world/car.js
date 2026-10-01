import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The shape of Rick's car, shared by the car itself (room.js) and the engine
// bay with the microverse battery (battery.js). The hull is a unit sphere
// scaled by HULL and centred HULL_Y up, in the car's frame: +x towards the
// nose, +z towards the room. The bay is an opening in it, in sphere angles:
// phi around the nose, theta down from the top.

export const CAR = { x: 6.2, z: -4.05, rot: -0.5 };
export const HULL = new THREE.Vector3(1.55, 0.36, 0.86);
export const HULL_Y = 0.72;

// Hull rows are PI / 20 apart; the opening sits on whole rows so the patches
// around it share their vertices and leave no cracks.
const ROW = Math.PI / 20;
const COL = (Math.PI * 2) / 36;
export const BAY = { phi: 4 * COL, from: 5 * ROW, to: 9 * ROW };
/** The bay's floor, below the hull's top so the battery sits inside the car. */
export const BAY_FLOOR = 0.67;

/** The hull, minus the opening for the engine bay (scale it by HULL). */
export function hullGeometry() {
  const around = Math.PI * 2 - BAY.phi * 2;
  const parts = [
    new THREE.SphereGeometry(1, 28, 20, Math.PI + BAY.phi, around),
    new THREE.SphereGeometry(1, 8, 5, Math.PI - BAY.phi, BAY.phi * 2, 0, BAY.from),
    new THREE.SphereGeometry(1, 8, 11, Math.PI - BAY.phi, BAY.phi * 2, BAY.to, Math.PI - BAY.to),
  ];
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

/** A point on the hull at sphere angles (phi, theta), `offset` out along its normal. */
export function hullPoint(phi, theta, offset = 0, out = new THREE.Vector3()) {
  const ux = -Math.cos(phi) * Math.sin(theta);
  const uy = Math.cos(theta);
  const uz = Math.sin(phi) * Math.sin(theta);
  const nx = ux / HULL.x, ny = uy / HULL.y, nz = uz / HULL.z;
  const k = offset / Math.hypot(nx, ny, nz);
  return out.set(ux * HULL.x + nx * k, HULL_Y + uy * HULL.y + ny * k, uz * HULL.z + nz * k);
}

/** The hull's surface over the opening, `offset` out: the hood. */
export function hoodGeometry(offset, cols = 8, rows = 6) {
  const positions = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      hullPoint(Math.PI - BAY.phi + (BAY.phi * 2 * i) / cols, BAY.from + ((BAY.to - BAY.from) * j) / rows, offset, p);
      positions.push(p.x, p.y, p.z);
    }
  }
  const index = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + cols + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** The opening's outline, `offset` out from the hull, as a closed loop. */
export function bayOutline(offset = 0, perEdge = 10) {
  const { phi, from, to } = BAY;
  const edges = [
    (k) => [Math.PI - phi + 2 * phi * k, from],
    (k) => [Math.PI + phi, from + (to - from) * k],
    (k) => [Math.PI + phi - 2 * phi * k, to],
    (k) => [Math.PI - phi, to - (to - from) * k],
  ];
  const loop = [];
  for (const edge of edges) for (let i = 0; i < perEdge; i++) loop.push(hullPoint(...edge(i / perEdge), offset));
  return loop;
}

/** A band of quads between two matching loops (the bay's walls, the hood's edge). */
export function band(a, b) {
  const positions = [];
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    for (const p of [a[i], b[i], a[j], b[i], b[j], a[j]]) positions.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** Floor footprint of the car for the first-person walker, as circles along it. */
export function carColliders() {
  const cos = Math.cos(CAR.rot);
  const sin = Math.sin(CAR.rot);
  return [[-1.2, 0.75], [-0.4, 0.88], [0.4, 0.88], [1.1, 0.68]].map(([x, r]) => ({ kind: 'circle', x: CAR.x + x * cos, z: CAR.z - x * sin, r }));
}
