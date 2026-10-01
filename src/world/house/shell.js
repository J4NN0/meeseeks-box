import * as THREE from 'three';
import { PALETTE, box, cyl, mesh, sphere, toon } from '../../engine/toon.js';
import { COLORS, DADO, DOOR, LIVING_ROOM, T } from './plan.js';
import { NO_SHADOW, archRing, extrude, openWall, slab, windowFrame } from '../walls.js';

// The living room's floor, walls and ceiling. The back wall always stands.
// The wall to the garage (with the door) and the front wall behind the
// couch (with the arch through to the spare room) are cut down to the dado
// in the overview. The rest of those two, the right wall with the sliding
// glass door to the yard, the door itself and the beamed ceiling only go up
// when you walk in.

// The arch through to the spare room (x along the front wall), and the
// sliding glass door out to the yard (z along the right wall).
const ARCH = { x: 12.1, width: 1.1, spring: 1.75 };
const ARCH_TRIM = 0.08;
const PATIO = { at: -2.3, width: 2.4, bottom: 0, top: 2.25 };
/** How far the door swings into the living room when it's open. */
const DOOR_SWING = 1.75;

/**
 * Builds the shell. `group` is always shown and `walls` only when walking;
 * `swing(open)` opens the door from 0 (shut) to 1. `colliders` are the walls
 * the walker can't pass, bar the door and the arch.
 */
export function buildShell({ theme, height: H }) {
  const group = new THREE.Group();
  const walls = new THREE.Group();
  const { minX, maxX, minZ, maxZ } = LIVING_ROOM;
  const x1 = maxX + T;
  const z0 = minZ - T;
  const z1 = maxZ + T;
  const wall = toon(COLORS.wall);
  const trim = toon(COLORS.trim);
  const ends = toon(theme.wallTrim);

  // Floor: a slab like the garage's, wall-to-wall tan carpet on top, and a
  // wooden threshold in the doorway.
  group.add(box(x1 - minX, 0.5, z1 - z0, PALETTE.floor, (minX + x1) / 2, -0.25, (z0 + z1) / 2));
  group.add(box(x1 - minX, 0.18, z1 - z0 + 0.3, '#5c6158', (minX + 0.15 + x1 + 0.15) / 2, -0.59, (z0 + z1) / 2));
  group.add(box(maxX - minX, 0.012, maxZ - minZ, COLORS.carpet, (minX + maxX) / 2, 0.006, (minZ + maxZ) / 2, NO_SHADOW));
  group.add(box(T, 0.014, DOOR.width, PALETTE.wood, minX - T / 2, 0.007, DOOR.z, NO_SHADOW));

  // The back wall, where the TV is, and its skirting.
  group.add(box(x1 - minX, H, T, wall, (minX + x1) / 2, H / 2, z0 + T / 2));
  group.add(box(maxX - minX, 0.1, 0.025, trim, (minX + maxX) / 2, 0.05, minZ + 0.0125, NO_SHADOW));

  // The wall to the garage, either side of the door, and over it.
  const wx = minX - T / 2;
  const doorFrom = DOOR.z - DOOR.width / 2;
  const doorTo = DOOR.z + DOOR.width / 2;
  for (const [a, b] of [[minZ, doorFrom], [doorTo, z1]]) {
    garageWall({ group, walls, theme, paint: wall, x: minX, from: a, to: b, height: H });
    const end = Math.min(b, maxZ);
    if (end > a) group.add(box(0.025, 0.1, end - a, trim, minX + 0.0125, 0.05, (a + end) / 2, NO_SHADOW));
  }
  const sides = garageSides(theme, wall, theme.wall);
  walls.add(slab(T, H - DOOR.height, DOOR.width, sides, wx, (DOOR.height + H) / 2, DOOR.z, NO_SHADOW));

  // The doorway: lined and cased in white on our side, in the garage's trim
  // on its side, and the door itself.
  walls.add(box(T, 0.02, DOOR.width, trim, wx, DOOR.height - 0.01, DOOR.z, NO_SHADOW));
  for (const z of [doorFrom + 0.01, doorTo - 0.01]) walls.add(box(T, DOOR.height, 0.02, trim, wx, DOOR.height / 2, z, NO_SHADOW));
  for (const [x, color] of [[minX + 0.015, trim], [minX - T - 0.015, ends]]) {
    for (const z of [doorFrom - 0.04, doorTo + 0.04]) walls.add(box(0.03, DOOR.height + 0.08, 0.08, color, x, (DOOR.height + 0.08) / 2, z, NO_SHADOW));
    walls.add(box(0.03, 0.08, DOOR.width + 0.16, color, x, DOOR.height + 0.04, DOOR.z, NO_SHADOW));
  }
  const door = doorLeaf();
  walls.add(door);

  // The front wall, behind the couch: our paint on this side, the spare
  // room's on that one, the arch through it. Cut down to the dado in the
  // overview too.
  const r = ARCH.width / 2;
  const archFrom = ARCH.x - r;
  const archTo = ARCH.x + r;
  const spare = toon(COLORS.spare);
  for (const [a, b] of [[minX, archFrom], [archTo, x1]]) {
    group.add(slab(b - a, DADO, T, [ends, ends, ends, ends, spare, wall], (a + b) / 2, DADO / 2, maxZ + T / 2));
  }
  const upper = new THREE.Shape();
  upper.moveTo(minX, DADO);
  upper.lineTo(archFrom, DADO);
  upper.lineTo(archFrom, ARCH.spring);
  upper.absarc(ARCH.x, ARCH.spring, r, Math.PI, 0, true);
  upper.lineTo(archTo, DADO);
  upper.lineTo(x1, DADO);
  upper.lineTo(x1, H);
  upper.lineTo(minX, H);
  upper.closePath();
  // Above the dado, a skin of each paint.
  walls.add(mesh(extrude(upper, T / 2).translate(0, 0, maxZ), wall, NO_SHADOW));
  walls.add(mesh(extrude(upper, T / 2).translate(0, 0, maxZ + T / 2), spare, NO_SHADOW));
  // The arch: lined in white, cased in white on both sides, a threshold.
  walls.add(mesh(extrude(archRing(ARCH, r - 0.02, r), T).translate(0, 0, maxZ), trim, NO_SHADOW));
  for (const z of [maxZ - 0.025, z1]) walls.add(mesh(extrude(archRing(ARCH, r, r + ARCH_TRIM), 0.025).translate(0, 0, z), trim, NO_SHADOW));
  group.add(box(ARCH.width, 0.014, T, PALETTE.wood, ARCH.x, 0.007, maxZ + T / 2, NO_SHADOW));
  for (const [a, b] of [[minX, archFrom - ARCH_TRIM], [archTo + ARCH_TRIM, maxX]]) {
    for (const z of [maxZ - 0.0125, z1 + 0.0125]) group.add(box(b - a, 0.1, 0.025, trim, (a + b) / 2, 0.05, z, NO_SHADOW));
  }

  // When you walk in: the right wall with the sliding door out to the
  // yard, ...
  const rightZ = (minZ + maxZ) / 2;
  const patio = { ...PATIO, at: rightZ - PATIO.at };
  const right = openWall(maxZ - minZ, H, [patio], wall);
  windowFrame(right, patio, toon('#9aa3ab'), false);
  right.rotation.y = Math.PI / 2;
  right.position.set(maxX + T / 2, 0, rightZ);
  walls.add(right);
  for (const [a, b] of [[minZ, PATIO.at - PATIO.width / 2], [PATIO.at + PATIO.width / 2, maxZ]]) walls.add(box(0.025, 0.1, b - a, trim, maxX - 0.0125, 0.05, (a + b) / 2, NO_SHADOW));
  // ... and the ceiling, with its dark beams.
  walls.add(box(x1 - minX, 0.2, z1 - z0 + 0.3, COLORS.ceiling, (minX + 0.15 + x1 + 0.15) / 2, H + 0.1, (z0 + z1) / 2, NO_SHADOW));
  for (let i = 0; i < 5; i++) walls.add(box(maxX - minX, 0.18, 0.16, COLORS.beam, (minX + maxX) / 2, H - 0.09, minZ + ((i + 0.5) * (maxZ - minZ)) / 5, NO_SHADOW));

  return {
    group,
    walls,
    swing(open) {
      door.rotation.y = -DOOR_SWING * open;
    },
    colliders: [
      { kind: 'box', minX: minX - T, maxX: minX, minZ, maxZ: doorFrom },
      { kind: 'box', minX: minX - T, maxX: minX, minZ: doorTo, maxZ: z1 },
      { kind: 'box', minX, maxX: archFrom, minZ: maxZ, maxZ: z1 },
      { kind: 'box', minX: archTo, maxX: x1, minZ: maxZ, maxZ: z1 },
    ],
  };
}

/** The door from the garage, hinged at its front edge, swinging into the living room. */
/** The faces of a wall to the garage: `paint` on our side (-x faces the garage), its trim on the ends. */
function garageSides(theme, paint, garage) {
  const ends = toon(theme.wallTrim);
  return [paint, toon(garage), ends, ends, ends, ends];
}

/**
 * A wall to the garage along z at `x`, from `from` to `to`: garage paint on
 * its side, with its dado rail and skirting, `paint` on ours. In the overview
 * only the part below the dado stands, its cut top in trim; the rest goes in
 * `walls`. Shared by the living room and the spare room.
 */
export function garageWall({ group, walls, theme, paint, x, from, to, height: H }) {
  const len = to - from;
  const zc = (from + to) / 2;
  const wx = x - T / 2;
  group.add(slab(T, DADO, len, garageSides(theme, paint, theme.wallDark), wx, DADO / 2, zc));
  walls.add(slab(T, H - DADO, len, garageSides(theme, paint, theme.wall), wx, (DADO + H) / 2, zc, NO_SHADOW));
  group.add(box(0.05, 0.05, len, theme.wallTrim, x - T - 0.02, DADO, zc, NO_SHADOW));
  group.add(box(0.06, 0.12, len, theme.wallTrim, x - T - 0.03, 0.06, zc, NO_SHADOW));
}

function doorLeaf() {
  const pivot = new THREE.Group();
  pivot.position.set(LIVING_ROOM.minX - 0.025, 0, DOOR.z + DOOR.width / 2 - 0.01);
  const w = DOOR.width - 0.03;
  const h = DOOR.height - 0.02;
  const d = 0.04;
  const paint = toon('#f2eee2');
  const brass = toon('#c9a14a');
  pivot.add(box(d, h, w, paint, -d / 2, h / 2 + 0.01, -w / 2, NO_SHADOW));
  for (const side of [-1, 1]) {
    // Two raised panels a side, and a knob.
    for (const [y, ph] of [[0.6, 0.78], [1.55, 0.72]]) pivot.add(box(0.012, ph, w - 0.24, paint, -d / 2 + side * (d / 2 + 0.006), y, -w / 2, NO_SHADOW));
    const neck = cyl(0.01, 0.01, 0.05, brass, 8, NO_SHADOW);
    neck.rotation.z = Math.PI / 2;
    neck.position.set(-d / 2 + side * 0.04, 1.0, -w + 0.08);
    pivot.add(neck, sphere(0.032, brass, 12, NO_SHADOW).translateX(-d / 2 + side * 0.07).translateY(1.0).translateZ(-w + 0.08));
  }
  return pivot;
}
