import * as THREE from 'three';
import { PALETTE, box, toon } from '../../engine/toon.js';
import { COLORS, SPARE_ROOM, T } from './plan.js';
import { garageWall } from './shell.js';
import { NO_SHADOW, openWall, windowFrame } from '../walls.js';

// The spare room, through the arch behind the living room couch: empty for
// now, green walls and bare floorboards. Like the others it's a cut-away:
// its wall to the garage stands to the dado in the overview, and its front
// and right walls (with windows) and its ceiling go up when you walk in. The
// wall it shares with the living room, arch and all, is in shell.js.

/** Its windows, along the front wall and the right wall from each one's middle. */
const WINDOWS = { front: [-1.6, 1.6], right: [0], width: 1.6, bottom: 0.9, top: 2.45 };

/** As buildShell: `group` always shown, `walls` only when walking, `colliders`. */
export function buildSpareRoom({ theme, height: H }) {
  const group = new THREE.Group();
  const walls = new THREE.Group();
  const { minX, maxX, minZ, maxZ } = SPARE_ROOM;
  const x1 = maxX + T;
  const z1 = maxZ + T;
  const paint = toon(COLORS.spare);
  const trim = toon(COLORS.trim);

  // The slab and its base, like the living room's, floorboards on top.
  group.add(box(x1 - minX, 0.5, z1 - minZ, PALETTE.floor, (minX + x1) / 2, -0.25, (minZ + z1) / 2));
  group.add(box(x1 - minX, 0.18, z1 - minZ, '#5c6158', (minX + x1) / 2 + 0.15, -0.59, (minZ + z1) / 2 + 0.15));
  group.add(box(maxX - minX, 0.012, maxZ - minZ, COLORS.floorboards, (minX + maxX) / 2, 0.006, (minZ + maxZ) / 2, NO_SHADOW));

  // The wall to the garage, and its skirting on this side.
  const zc = (minZ + maxZ) / 2;
  garageWall({ group, walls, theme, paint, x: minX, from: minZ, to: maxZ, height: H });
  group.add(box(0.025, 0.1, maxZ - minZ, trim, minX + 0.0125, 0.05, zc, NO_SHADOW));

  // When you walk in: the front wall and the right wall, with windows, ...
  const hole = (at) => ({ at, width: WINDOWS.width, bottom: WINDOWS.bottom, top: WINDOWS.top });
  const front = openWall(maxX - minX, H, WINDOWS.front.map(hole), paint);
  for (const at of WINDOWS.front) windowFrame(front, hole(at), trim, true);
  front.position.set((minX + maxX) / 2, 0, maxZ + T / 2);
  walls.add(front);
  const right = openWall(z1 - minZ, H, WINDOWS.right.map(hole), paint);
  for (const at of WINDOWS.right) windowFrame(right, hole(at), trim, true);
  right.rotation.y = Math.PI / 2;
  right.position.set(maxX + T / 2, 0, (minZ + z1) / 2);
  walls.add(right);
  walls.add(box(maxX - minX, 0.1, 0.025, trim, (minX + maxX) / 2, 0.05, maxZ - 0.0125, NO_SHADOW));
  walls.add(box(0.025, 0.1, maxZ - minZ, trim, maxX - 0.0125, 0.05, zc, NO_SHADOW));
  // ... and the ceiling.
  walls.add(box(x1 - minX, 0.2, z1 - minZ, COLORS.ceiling, (minX + x1) / 2 + 0.15, H + 0.1, (minZ + z1) / 2 + 0.15, NO_SHADOW));

  return {
    group,
    walls,
    colliders: [{ kind: 'box', minX: minX - T, maxX: minX, minZ, maxZ }],
  };
}
