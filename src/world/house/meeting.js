import * as THREE from 'three';
import { CHAIR_COLORS, officeChair } from '../desk.js';
import { nearestOnPath } from '../paths.js';
import { ARCH, MEETING_ROOM } from './plan.js';
import { SETTING, TABLE, createBell, createCoffee, createFlipChart, createMug, createNotepad, createTable, padPaper } from './conference.js';
import { CallScreens } from './call-screen.js';

// What's in the meeting room, and where everyone goes when the meeting's
// called: ten places at the table (the back row first, so the overview sees
// their faces, then the ends, then the front), then spots round the walls
// for whoever doesn't fit. Agents in the other universes join on floating
// TVs at the head of the table, by the wall to the garage (call-screen.js).
//
// A place is { chair, at, yaw, agent }: `at` is where an agent walks to
// (behind its chair, or the spot it stands on), `yaw` the way it faces. At
// the table it takes notes and drinks its coffee (agents/agent.js).

const { damp } = THREE.MathUtils;
const V = (x, z) => new THREE.Vector3(x, 0, z);

const TABLE_AT = V(11.55, 3.6);
/** From a chair's middle to the table's edge, as at a desk. */
const CHAIR_GAP = 0.28;
/** Behind a chair, where an agent stands before sitting down, as at a desk. */
const APPROACH = 0.55;
const MUG_COLORS = ['#e74c3c', '#f5f5f5', '#3498db', '#97ce4c', '#fdcb6e', '#9b5de5', '#f5f5f5'];

const LONG = TABLE.length / 2 + CHAIR_GAP;
const WIDE = TABLE.width / 2 + CHAIR_GAP;
/** In filling order: `face` is the way the one sitting there faces (0 is +z, the front). */
const SEATS = [
  ...[-0.41, 0.41, -1.23, 1.23].map((dx) => ({ x: TABLE_AT.x + dx, z: TABLE_AT.z - WIDE, face: 0 })),
  { x: TABLE_AT.x - LONG, z: TABLE_AT.z, face: Math.PI / 2 },
  { x: TABLE_AT.x + LONG, z: TABLE_AT.z, face: -Math.PI / 2 },
  ...[-0.41, 0.41, -1.23, 1.23].map((dx) => ({ x: TABLE_AT.x + dx, z: TABLE_AT.z + WIDE, face: Math.PI })),
];
/** Round the walls, facing the table: by the arch, the sides, then along the windows. */
const STANDING = [
  [9.2, 1.45], [10.05, 1.45], [10.9, 1.45], [13.3, 1.45],
  [8.62, 3.0], [8.62, 4.2], [14.48, 3.0], [14.48, 4.2],
  [9.2, 5.6], [10.1, 5.6], [11.0, 5.6], [11.9, 5.6], [12.8, 5.6], [13.7, 5.6], [14.4, 5.6],
];

/** The walk round the table, behind the chairs: its corners, going round. */
const RING = [
  V(TABLE_AT.x - LONG - APPROACH, TABLE_AT.z - WIDE - APPROACH),
  V(TABLE_AT.x + LONG + APPROACH, TABLE_AT.z - WIDE - APPROACH),
  V(TABLE_AT.x + LONG + APPROACH, TABLE_AT.z + WIDE + APPROACH),
  V(TABLE_AT.x - LONG - APPROACH, TABLE_AT.z + WIDE + APPROACH),
];
/** Where the way in through the arch meets the walk round the table. */
const RING_IN = V(ARCH.x, RING[0].z);

const ON_TABLE = { coffee: [-0.25, 0.02], bell: [0.8, 0] };
const FLIP_CHART = { at: [14.4, 1.35] };

export function buildMeeting() {
  const group = new THREE.Group();
  const colliders = [];

  const table = createTable();
  table.position.copy(TABLE_AT);
  group.add(table);
  colliders.push({ kind: 'box', minX: TABLE_AT.x - TABLE.length / 2, maxX: TABLE_AT.x + TABLE.length / 2, minZ: TABLE_AT.z - TABLE.width / 2, maxZ: TABLE_AT.z + TABLE.width / 2 });

  const coffee = createCoffee();
  coffee.position.set(TABLE_AT.x + ON_TABLE.coffee[0], TABLE.top, TABLE_AT.z + ON_TABLE.coffee[1]);
  coffee.rotation.y = -0.5;
  group.add(coffee);
  const bell = createBell();
  bell.group.position.set(TABLE_AT.x + ON_TABLE.bell[0], TABLE.top, TABLE_AT.z + ON_TABLE.bell[1]);
  group.add(bell.group);

  const chart = createFlipChart();
  const [cx, cz] = FLIP_CHART.at;
  chart.position.set(cx, 0, cz);
  chart.rotation.y = Math.atan2(TABLE_AT.x - cx, TABLE_AT.z - cz);
  group.add(chart);
  colliders.push({ kind: 'circle', x: cx, z: cz, r: 0.4 });

  const paper = padPaper();
  const chairs = SEATS.map((spot, index) => {
    const chair = meetingChair(index, spot, paper);
    group.add(chair.root);
    colliders.push({ kind: 'circle', x: spot.x, z: spot.z, r: 0.26 });
    return chair;
  });
  const places = [
    ...chairs.map((chair, i) => ({ chair, at: chair.approach, yaw: SEATS[i].face, agent: null })),
    ...STANDING.map(([x, z]) => ({ chair: null, at: V(x, z), yaw: Math.atan2(TABLE_AT.x - x, TABLE_AT.z - z), agent: null })),
  ];

  // Past the far end of the table, behind everyone as the overview sees it.
  const calls = new CallScreens(group, { at: new THREE.Vector3(MEETING_ROOM.minX + 0.55, 2.7, TABLE_AT.z), step: new THREE.Vector3(0, 0, 1.6) });

  return {
    group,
    colliders,
    places,
    bell,
    calls,
    /** Where the walk through the arch joins the walk round the table. */
    door: RING_IN,
    /** Over the table from the front corner, for the overview, with the call screens in. */
    view: { eye: new THREE.Vector3(16.9, 8.6, 12.6), look: new THREE.Vector3(TABLE_AT.x - 0.5, 1.0, TABLE_AT.z - 0.2) },

    /** Somewhere to stand once every place is taken: by one of the spots, a bit off it. */
    extraPlace() {
      const [x, z] = STANDING[Math.floor(Math.random() * STANDING.length)];
      const at = V(x + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.4);
      return { chair: null, at, yaw: Math.atan2(TABLE_AT.x - at.x, TABLE_AT.z - at.z), agent: null };
    },

    /** In the room proper, rather than in the arch or on the way to it. */
    inside(p) {
      if (p.z < MEETING_ROOM.minZ - 0.15) return false;
      return !(Math.abs(p.x - ARCH.x) < 0.45 && p.z < RING_IN.z - 0.1);
    },

    /** From one point in the room to another, round the table: the points to walk through, then `to`. */
    route(from, to) {
      return [...around(from, to), to.clone()];
    },

    update(dt, t, eye) {
      bell.update(dt);
      for (const chair of chairs) chair.update(dt);
      calls.update(dt, t, eye);
    },
  };
}

/**
 * A swivel chair at the table, with a notepad and a mug of coffee in front
 * of it. Agents sit in it as they do at a desk (`seat`, `swivelTarget`,
 * `backYaw`), write on the pad (`slidePad` pulls it within reach) and drink
 * from the mug (`holdCup` puts it in their hand).
 */
function meetingChair(index, { x, z, face }, paper) {
  const { chair, swivel, seat } = officeChair(CHAIR_COLORS[index % CHAIR_COLORS.length]);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  // Whoever sits here faces the chair's -z: its +x is our -x.
  root.rotation.y = face + Math.PI;
  root.add(chair);
  // The pad squared up to the place, give or take, its binding at the far end.
  const pad = createNotepad(paper);
  const padTurn = index % 2 ? 0.08 : -0.05;
  const padHome = new THREE.Vector3(-SETTING.pad.x, TABLE.top, -SETTING.pad.z);
  const padTo = padHome.clone();
  pad.position.copy(padHome);
  pad.rotation.y = padTurn;
  root.add(pad);
  const cup = createMug(MUG_COLORS[index % MUG_COLORS.length]);
  const home = new THREE.Vector3(-SETTING.cup.x, TABLE.top, -SETTING.cup.z);
  root.add(cup);
  const up = new THREE.Vector3();
  const held = new THREE.Vector3();
  const place = (at, tilt, k) => {
    cup.rotation.set(tilt, Math.PI, 0);
    cup.position.copy(home);
    if (!at || k <= 0) return;
    // `at` is the mug's middle; its origin is at the bottom.
    root.updateWorldMatrix(true, false);
    root.worldToLocal(held.copy(at)).sub(up.set(0, Math.cos(tilt), Math.sin(tilt)).multiplyScalar(0.05));
    cup.position.lerp(held, k);
  };
  place(null, 0, 0);
  return {
    root,
    swivel,
    seat,
    swivelTarget: 0,
    backYaw: face + Math.PI,
    approach: V(x - Math.sin(face) * APPROACH, z - Math.cos(face) * APPROACH),
    /** The pad and the mug, as the one sitting here sees them, and how the pad's turned. */
    setting: SETTING,
    padTurn,
    /** Slides the pad to `at` (the middle of its paper, as the one sitting here sees it), or back to its place. */
    slidePad(at) {
      if (at) padTo.set(-at.x, TABLE.top, -at.z);
      else padTo.copy(padHome);
    },
    /**
     * The mug in a hand, its middle at `at` (world space) and tipped towards
     * the drinker by `tilt`: `k` of the way there from the table, as it's
     * picked up. With no `at`, back on the table.
     */
    holdCup(at, tilt = 0, k = 1) {
      place(at, tilt, k);
    },
    update(dt) {
      swivel.rotation.y = damp(swivel.rotation.y, this.swivelTarget, 4, dt);
      pad.position.lerp(padTo, 1 - Math.exp(-6 * dt));
    },
  };
}


/** Onto the walk round the table from `from`, the shorter way round, and off it towards `to`. */
function around(from, to) {
  const a = nearestOnPath(RING, from, true);
  const b = nearestOnPath(RING, to, true);
  const n = RING.length;
  const forward = [];
  const back = [];
  if (!(a.k === b.k && a.t <= b.t)) {
    let k = a.k;
    do {
      k = (k + 1) % n;
      forward.push(RING[k]);
    } while (k !== b.k);
  }
  if (!(a.k === b.k && a.t >= b.t)) {
    let k = a.k;
    back.push(RING[k]);
    while (k !== (b.k + 1) % n) {
      k = (k - 1 + n) % n;
      back.push(RING[k]);
    }
  }
  const length = (list) => {
    let d = 0;
    let p = a.point;
    for (const q of [...list, b.point]) {
      d += p.distanceTo(q);
      p = q;
    }
    return d;
  };
  const way = length(forward) <= length(back) ? forward : back;
  return [a.point, ...way, b.point].map((v) => v.clone());
}
