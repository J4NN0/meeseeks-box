import * as THREE from 'three';
import { cyl, mesh, toon } from '../../engine/toon.js';

// The little round stand a ball sits on, more than one prop rests on.

const CUP = { radius: 0.022, height: 0.014 };

/**
 * A stand in `color`, origin at its bottom, and `seat`: the height a ball of
 * `radius` is centred at, resting in its cup.
 */
export function ballStand(color, radius) {
  const stand = new THREE.Group();
  const material = toon(color);
  stand.add(cyl(0.03, 0.034, 0.01, material, 24).translateY(0.005));
  const cup = mesh(new THREE.TorusGeometry(CUP.radius, 0.006, 8, 24), material);
  cup.rotation.x = Math.PI / 2;
  cup.position.y = CUP.height;
  stand.add(cup);
  return { stand, seat: CUP.height + Math.sqrt(radius ** 2 - CUP.radius ** 2) };
}
