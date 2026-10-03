import * as THREE from 'three';
import { buildShell } from './shell.js';
import { buildMeetingRoom } from './meeting-room.js';
import { buildMeeting } from './meeting.js';
import { createArmchair, createCouch } from './couch.js';
import { CONSOLE, createTv } from './tv.js';
import { createRemote } from './remote.js';
import {
  COFFEE_TABLE, createBookshelf, createCoffeeTable, createDresser, createEndTable, createFlowers, createLamp, createMirror, createRug,
  flowerPicture, greenPainting, littlePicture,
} from './decor.js';
import { ARCH, DOOR, LIVING_ROOM, T } from './plan.js';

export { DOOR, LIVING_ROOM, MEETING_ROOM } from './plan.js';

// The Smiths' living room from Rick and Morty, through a door in the
// garage's right wall: the mint couch facing the TV, Rick's
// interdimensional cable box beside it, the remote on the coffee table.
// Through the arch behind the couch, the meeting room (meeting-room.js, and
// what's in it in meeting.js). Each piece is built in its own file (the TV
// and the remote are live); where it stands is only its line below.

/**
 * On the floor, in room coordinates: `at` [x, z], `turn` about y (0 faces
 * the front of the room, +z; PI faces the TV). `solid` is what the walker
 * bumps into: [width, depth] before turning, or a radius.
 */
const FLOOR = [
  { name: 'Rug', make: createRug, at: [12.5, -3.65] },
  { name: 'Couch', make: createCouch, at: [12.5, -2.45], turn: Math.PI, solid: [2.3, 0.95] },
  { name: 'Coffee table', make: createCoffeeTable, at: [12.5, -3.85], solid: [COFFEE_TABLE.width, COFFEE_TABLE.depth] },
  { name: 'Lamp table', make: () => createEndTable(createLamp()), at: [10.95, -2.5], solid: [0.5, 0.5] },
  { name: 'Armchair', make: createArmchair, at: [10.55, -3.33], turn: 2.0, solid: 0.5 },
  // Behind the couch, in the corner by the sliding door.
  { name: 'Bookshelf', make: createBookshelf, at: [14.0, 0.415], turn: Math.PI, solid: [1.55, 0.35] },
  // On the same wall, past the arch to the meeting room.
  { name: 'Dresser', make: () => createDresser(createFlowers()), at: [10.47, 0.365], turn: Math.PI, solid: [1.0, 0.45] },
];

/**
 * On the walls: `at` [x, y, z], the middle of its back; `turn` about y.
 * `walking` ones hang on walls that are only up when you walk in.
 */
const WALLS = [
  { name: 'Flower picture', make: flowerPicture, at: [13.85, 1.6, -6] },
  { name: 'Little picture', make: littlePicture, at: [14.4, 1.72, -6] },
  { name: 'Green painting', make: greenPainting, at: [14.8, 1.65, -4.4], turn: -Math.PI / 2, walking: true },
  { name: 'Mirror', make: createMirror, at: [10.47, 1.62, 0.6], turn: Math.PI, walking: true },
];

const TV_AT = [12.5, -5.75];
/** On the coffee table, angled as if just put down. */
const REMOTE_AT = { at: [12.78, -3.78], turn: 0.5 };
/** How close you get before the door opens for you. */
const DOOR_REACH = 2.2;
/**
 * The way agents walk through to the meeting room, from the garage side of
 * the door: in, along behind the couch, and through the arch.
 */
const WAY_THROUGH = [[LIVING_ROOM.minX - 0.55, DOOR.z], [LIVING_ROOM.minX + 0.6, DOOR.z], [ARCH.x, DOOR.z]];

/**
 * Builds the room. Add `group` to the room and `walls` to what goes up when
 * you walk in. `update(dt, t, eye, walking)` takes where you're looking
 * from, and whether you're walking (when the door opens for you).
 */
export function buildLivingRoom({ theme, height }) {
  const shell = buildShell({ theme, height });
  const room = buildMeetingRoom({ theme, height });
  const meeting = buildMeeting();
  const { group, walls } = shell;
  group.add(room.group, meeting.group);
  walls.add(room.walls);
  const colliders = [...shell.colliders, ...room.colliders, ...meeting.colliders];

  for (const { make, at: [x, z], turn = 0, solid } of FLOOR) {
    const piece = make();
    piece.position.set(x, 0, z);
    piece.rotation.y = turn;
    group.add(piece);
    if (Array.isArray(solid)) {
      const [w, d] = solid;
      const c = Math.abs(Math.cos(turn));
      const s = Math.abs(Math.sin(turn));
      const hw = (c * w + s * d) / 2;
      const hd = (s * w + c * d) / 2;
      colliders.push({ kind: 'box', minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
    } else if (solid) {
      colliders.push({ kind: 'circle', x, z, r: solid });
    }
  }
  for (const { make, at, turn = 0, walking } of WALLS) {
    const piece = make();
    piece.position.set(...at);
    piece.rotation.y = turn;
    (walking ? walls : group).add(piece);
  }

  const tv = createTv();
  tv.group.position.set(TV_AT[0], 0, TV_AT[1]);
  group.add(tv.group);
  // Its back is against the wall, so it blocks right up to it.
  colliders.push({
    kind: 'box',
    minX: TV_AT[0] - CONSOLE.width / 2, maxX: TV_AT[0] + CONSOLE.width / 2,
    minZ: LIVING_ROOM.minZ, maxZ: TV_AT[1] + CONSOLE.depth / 2,
  });
  const remote = createRemote();
  remote.group.position.set(REMOTE_AT.at[0], COFFEE_TABLE.height, REMOTE_AT.at[1]);
  remote.group.rotation.y = REMOTE_AT.turn;
  group.add(remote.group);

  const doorX = LIVING_ROOM.minX - T / 2;
  let open = 0;
  let held = false;
  return {
    group,
    walls,
    colliders,
    meeting,
    /** From the garage side of the door to where it meets the walk round the meeting table. */
    way: [...WAY_THROUGH.map(([x, z]) => new THREE.Vector3(x, 0, z)), meeting.door.clone()],
    /** From behind the couch, looking at the TV. */
    view: { eye: new THREE.Vector3(TV_AT[0], 2.05, 0.4), look: new THREE.Vector3(TV_AT[0], 0.95, TV_AT[1]) },
    get channel() { return tv.channel; },
    changeChannel() {
      remote.press();
      tv.next();
    },
    /** Someone's walking through: the door opens for them too (for this frame). */
    holdDoor() {
      held = true;
    },
    update(dt, t, eye, walking) {
      tv.update(dt, t);
      remote.update(dt);
      meeting.update(dt, t, eye);
      const near = walking && eye && Math.hypot(eye.x - doorX, eye.z - DOOR.z) < DOOR_REACH;
      open = THREE.MathUtils.damp(open, near || held ? 1 : 0, 6, dt);
      held = false;
      shell.swing(open);
    },
  };
}
