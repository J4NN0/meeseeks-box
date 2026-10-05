import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, toon } from '../../engine/toon.js';

// What props hang on the pegboard by: its pegs and hooks, and rods for the
// cords between. All in the board's frame, its face at z = 0.

/** The iron of the board's pegs and hooks. */
export const IRON = '#8b8f95';
/** A peg's rod, and the ball on its end. */
export const PEG = { radius: 0.0035, ball: 0.005 };

/** A thin round rod from `a` to `b`. */
export function rod(a, b, radius, material) {
  const m = mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8), material);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** A peg out of the hole at (x, y), `out` long, with a ball on the end. */
export function peg(x, y, out) {
  const shaft = new THREE.CylinderGeometry(PEG.radius, PEG.radius, out, 8).rotateX(Math.PI / 2).translate(x, y, out / 2);
  const ball = new THREE.SphereGeometry(PEG.ball, 10, 8).translate(x, y, out);
  return mesh(mergeGeometries([shaft, ball]), toon(IRON));
}

/**
 * A J-hook out of the hole at (x, y), in wire `wire` round: straight out
 * `reach`, then turned up over `bend` to end `rise` higher in a ball, so
 * what lies on it can't roll off.
 */
export function hookGeometry(x, y, { wire, reach, bend, rise }) {
  const V = THREE.Vector3;
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new V(x, y, -0.006), new V(x, y, reach)));
  path.add(new THREE.QuadraticBezierCurve3(new V(x, y, reach), new V(x, y, reach + bend), new V(x, y + rise, reach + bend)));
  const knob = new THREE.SphereGeometry(wire, 8, 6).translate(x, y + rise, reach + bend);
  return mergeGeometries([new THREE.TubeGeometry(path, 16, wire, 8), knob]);
}
