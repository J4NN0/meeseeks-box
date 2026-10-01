import { createAnduril } from './lotr/anduril.js';
import { createOneRing } from './lotr/one-ring.js';
import { createPalantir } from './lotr/palantir.js';
import { createPills } from './matrix/pills.js';
import { createSpoon } from './matrix/spoon.js';
import { createNeuralyzer } from './men-in-black/neuralyzer.js';
import { createLokiMask } from './the-mask/loki-mask.js';
import { createFourStarBall } from './dragon-ball/four-star-ball.js';
import { createPokeBall } from './pokemon/poke-ball.js';

// Movie and cartoon keepsakes on the left wall, the pegboard and the
// workbench. Each prop is built in its own file, grouped by where it's from,
// with its origin where it rests (the bottom middle on a surface, the middle
// of its back on a wall) and its front facing +z. Where it goes and how big
// it is are only its line below: change those, nothing else. Props that can
// sit or hang take a `mount`. A prop that moves sets `userData.update(dt, t)`.

/** On the walls, in room coordinates: `at` [x, y, z], `turn` about y. */
export const WALL = [
  { name: 'Andúril', make: createAnduril, at: [-8, 2.62, -1.9], turn: Math.PI / 2, scale: 1.4 },
];

/**
 * On the pegboard over the workbench: `at` [y, z], the height off the floor
 * (the board runs from 1.3 to 2.6) and z along it as on the bench below.
 */
export const BOARD = [
  { name: 'Mask of Loki', make: () => createLokiMask({ mount: 'board' }), at: [2.0, -0.6], scale: 1.15 },
  { name: 'The spoon', make: () => createSpoon({ mount: 'board' }), at: [1.97, 0.6] },
];

/**
 * On the workbench, in its frame: `at` [x, z], x from the pegboard (-0.5) to
 * the front edge (0.5) and z along it (-1.4 by the plant to 1.4 by Andúril);
 * `on` the top or the shelf below (x within 0.4 of the middle, between the
 * legs). `turn` is about y, from facing the room.
 *
 * Zigzagging back and front 50cm apart, with room between for more.
 */
const BACK = -0.15;
const FRONT = 0.15;
// Turned a little towards the open side of the room, where you come from.
const TURN = -0.35;
export const BENCH = [
  { name: 'The One Ring', make: createOneRing, at: [BACK, 1.0], turn: TURN, scale: 0.85 },
  { name: 'Red & blue pills', make: createPills, at: [FRONT, 0.5], turn: TURN },
  { name: 'Neuralyzer', make: createNeuralyzer, at: [BACK, 0], turn: TURN },
  { name: 'Four-star Dragon Ball', make: createFourStarBall, at: [FRONT, -0.5], turn: TURN },
  { name: 'Poké Ball', make: createPokeBall, at: [BACK, -1.0], turn: TURN },
  { name: 'Palantír', make: createPalantir, at: [0.1, 0.95], on: 'shelf', turn: TURN },
];

/**
 * Builds the collection into `room`, and onto `bench`: its group, the
 * heights of its top and shelf, and where the pegboard's face is.
 * Returns the updates of the props that move.
 */
export function addCollection(room, bench) {
  const props = [];
  const place = (parent, { make, scale = 1 }, x, y, z, turn) => {
    const prop = make();
    prop.position.set(x, y, z);
    prop.rotation.y = turn;
    prop.scale.setScalar(scale);
    parent.add(prop);
    props.push(prop);
  };
  for (const p of WALL) place(room, p, ...p.at, p.turn ?? 0);
  for (const p of BOARD) place(bench.group, p, bench.board, p.at[0], p.at[1], Math.PI / 2);
  for (const p of BENCH) place(bench.group, p, p.at[0], bench[p.on ?? 'top'], p.at[1], Math.PI / 2 + (p.turn ?? 0));
  return props.map((p) => p.userData.update).filter(Boolean);
}
