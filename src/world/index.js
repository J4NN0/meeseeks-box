import * as THREE from 'three';
import { buildRoom } from './room.js';
import { CHAIR_Z, Desk } from './desk.js';
import { Effects } from './effects.js';
import { createMeeseeksBox } from './box.js';
import { createBattery } from './battery.js';
import { verse } from './verses.js';
import { DOOR, LIVING_ROOM } from './house/index.js';
import { nearestOnPath } from './paths.js';

const COLS = [-3.3, -1.1, 1.1, 3.3];
const ROWS = [-3.5, -1.1, 1.3];
export const DESK_COUNT = COLS.length * ROWS.length;
// Fill from the camera side first so the first few agents are big and clear.
const FILL_ORDER = [[2, 1], [2, 2], [1, 1], [1, 2], [2, 0], [2, 3], [1, 0], [1, 3], [0, 1], [0, 2], [0, 0], [0, 3]];
// Overflow agents without a desk hang out in the chill zone.
const LOUNGE = [[-5.0, 3.1, 2.3], [-4.0, 4.2, 2.6], [-6.4, 4.4, 1.2], [5.0, 0.8, -1.2], [5.0, 4.6, -2.0], [7.5, 1.0, -1.8], [-3.6, 5.3, 3.0], [3.4, 5.2, 3.0]];

// Right of the last desk column, so walks to and from the car stay clear.
const SIDE_AISLE_X = 4.62;
// Between the desk columns, clear from the front of the garage to the back.
const GAPS = COLS.slice(1).map((x, i) => (x + COLS[i]) / 2);
// Behind each row of chairs, clear from one side of the garage to the other,
// and one in front of the back row's monitors, by the coffee bar.
const LANES = [ROWS[0] - 0.95, ...ROWS.map((z) => z + CHAIR_Z + 0.55)];
// Where the side aisle meets the line through the living room door.
const HUB = new THREE.Vector3(SIDE_AISLE_X, 0, DOOR.z);
// The garage's side of the wall to the house.
const HOUSE_X = LIVING_ROOM.minX - 0.15;

/**
 * One office: the garage (level 0) or a universe in a car battery. `boards`
 * are the shared wall boards; `onEnterGate` runs when this office's battery
 * tag is clicked.
 */
export class World {
  constructor(scene, { level = 0, boards, onEnterGate } = {}) {
    this.scene = scene;
    this.level = level;
    this.room = buildRoom(scene, { theme: verse(level), ...boards });
    this.effects = new Effects(scene);
    this.battery = createBattery({ inside: verse(level + 1).name, onEnter: () => onEnterGate?.(level + 1) });
    scene.add(this.battery.group);

    this.box = createMeeseeksBox();
    this.box.group.position.set(0, 0, 4.05);
    scene.add(this.box.group);
    this.spawnPoint = new THREE.Vector3(0, 0, 3.35);

    this.desks = [];
    ROWS.forEach((z, row) => COLS.forEach((x, col) => {
      const desk = new Desk(row * COLS.length + col, x, z);
      desk.row = row;
      desk.col = col;
      scene.add(desk.root);
      this.desks.push(desk);
    }));
    this.fillOrder = FILL_ORDER.map(([row, col]) => this.desks[row * COLS.length + col]);

    // Everything the first-person walker bumps into.
    this.colliders = [...this.room.colliders, { kind: 'circle', x: 0, z: 4.05, r: 0.45 }];
    for (const d of this.desks) {
      const p = d.root.position;
      this.colliders.push({ kind: 'box', minX: p.x - 0.76, maxX: p.x + 0.76, minZ: p.z - 0.4, maxZ: p.z + 0.4 });
      this.colliders.push({ kind: 'circle', x: p.x, z: p.z + 0.66, r: 0.3 });
    }
    this.loungeTaken = new Set();

    // The way to the meeting room: from the side aisle, through the house to
    // the walk round the table.
    this.meeting = this.room.living.meeting;
    this.way = [HUB.clone(), ...this.room.living.way];
  }

  claimDesk(agent) {
    const desk = this.fillOrder.find((d) => d.free);
    if (desk) desk.agent = agent;
    return desk || null;
  }

  claimLounge(agent) {
    for (let i = 0; i < LOUNGE.length; i++) {
      if (this.loungeTaken.has(i)) continue;
      this.loungeTaken.add(i);
      const [x, z, rot] = LOUNGE[i];
      return { index: i, position: new THREE.Vector3(x, 0, z), rotation: rot, agent };
    }
    const [x, z, rot] = LOUNGE[Math.floor(Math.random() * LOUNGE.length)];
    return { index: -1, position: new THREE.Vector3(x + Math.random() - 0.5, 0, z + Math.random() - 0.5), rotation: rot, agent };
  }

  releaseLounge(spot) {
    if (spot && spot.index >= 0) this.loungeTaken.delete(spot.index);
  }

  /** Walk down the centre aisle, then along the row behind the chairs. */
  pathTo(target) {
    const s = this.spawnPoint;
    return [new THREE.Vector3(s.x, 0, s.z - 0.2), new THREE.Vector3(0, 0, target.z), target.clone()];
  }

  /** Out of the battery, up the side aisle, then along the row. */
  pathFromBattery(target) {
    return [new THREE.Vector3(SIDE_AISLE_X, 0, target.z), target.clone()];
  }

  /** Along the row to the side aisle, then into the battery. */
  pathToBattery(from) {
    return [new THREE.Vector3(SIDE_AISLE_X, 0, from.z), this.battery.mouth.clone()];
  }

  /** A place in the meeting room: a chair at the table, or else a spot to stand. */
  claimMeetingPlace(agent) {
    const place = this.meeting.places.find((p) => !p.agent) || this.meeting.extraPlace();
    place.agent = agent;
    return place;
  }

  releaseMeetingPlace(place) {
    if (place) place.agent = null;
  }

  /**
   * The points to walk through from `from` to `to`, wherever they are in the
   * garage, the living room or the meeting room: along the lanes behind the
   * chairs and down the side aisle, through the house, round the table.
   */
  route(from, to) {
    const meeting = this.meeting;
    const zone = (p) => (p.x < HOUSE_X ? 'garage' : meeting.inside(p) ? 'meeting' : 'house');
    const a = zone(from);
    const b = zone(to);
    if (a === 'meeting' && b === 'meeting') return meeting.route(from, to);
    if (a === 'garage' && b === 'garage') return [...this.toAisle(from, to), to.clone()];
    const end = this.way.at(-1);
    const on = a === 'garage' ? this.toHouse(from) : a === 'meeting' ? meeting.route(from, end) : [];
    const off = b === 'garage' ? this.toHouse(to).reverse() : b === 'meeting' ? meeting.route(end, to).slice(0, -1) : [];
    const along = this.alongWay(wayAt(this.way, on.at(-1) || from), wayAt(this.way, off[0] || to));
    return [...on, ...along, ...off, to.clone()];
  }

  /** From a point in the garage to the line through the house door, keeping clear of the desks. */
  toHouse(p) {
    if (openFloor(p)) return [new THREE.Vector3(p.x, 0, DOOR.z)];
    return [...this.toAisle(p), HUB.clone()];
  }

  /**
   * From a point in the garage out to the side aisle along the lane it's on,
   * keeping clear of the desks, and if `to` is in the garage too, back in
   * along its lane (or just along the one lane, if it's the same), crossing
   * over by whichever gap between the desks is on the way.
   */
  toAisle(p, to = null) {
    const out = openFloor(p) ? [] : [new THREE.Vector3(p.x, 0, nearestLane(p))];
    if (to && !openFloor(to) && out.length) {
      const lane = nearestLane(to);
      if (lane === out[0].z) return [...out, new THREE.Vector3(to.x, 0, lane)];
      const via = (x) => Math.abs(p.x - x) + Math.abs(x - to.x);
      const x = [...GAPS, SIDE_AISLE_X].reduce((a, b) => (via(b) < via(a) ? b : a));
      return [...out, new THREE.Vector3(x, 0, out[0].z), new THREE.Vector3(x, 0, lane), new THREE.Vector3(to.x, 0, lane)];
    }
    if (out.length) out.push(new THREE.Vector3(SIDE_AISLE_X, 0, out[0].z));
    if (to && !openFloor(to)) out.push(new THREE.Vector3(SIDE_AISLE_X, 0, nearestLane(to)), new THREE.Vector3(to.x, 0, nearestLane(to)));
    return out;
  }

  /** The corners of the way through the house between two points on it (as `wayAt` measures them). */
  alongWay(from, to) {
    const out = [];
    if (from < to) for (let k = Math.floor(from) + 1; k < to; k++) out.push(this.way[k].clone());
    else for (let k = Math.ceil(from) - 1; k > to; k--) out.push(this.way[k].clone());
    return out;
  }

  /** An agent walking by: the living room's door opens for it. */
  passing(p) {
    if (Math.abs(p.x - LIVING_ROOM.minX) < 1.4 && Math.abs(p.z - DOOR.z) < 1.2) this.room.living.holdDoor();
  }

  /** `camera` is where you're looking from (the living room's door opens for you). */
  update(dt, t, now, camera) {
    this.room.update(dt, t, camera);
    this.box.update(dt, t);
    this.battery.update(dt, t);
    this.effects.update(dt);
    for (const d of this.desks) d.update(dt, t, now);
  }
}

/** Right of the desks, the garage is open floor. */
function openFloor(p) {
  return p.x >= SIDE_AISLE_X - 0.2;
}

function nearestLane(p) {
  return LANES.reduce((a, b) => (Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a));
}

/** How far along a polyline `p` is, nearest: the index of its corner before, plus how far to the next. */
function wayAt(way, p) {
  const { k, t } = nearestOnPath(way, p);
  return k + t;
}
