import * as THREE from 'three';
import { buildRoom } from './room.js';
import { Desk } from './desk.js';
import { Effects } from './effects.js';
import { createMeeseeksBox } from './box.js';

const COLS = [-3.3, -1.1, 1.1, 3.3];
const ROWS = [-3.5, -1.1, 1.3];
// Fill from the camera side first so the first few agents are big and clear.
const FILL_ORDER = [[2, 1], [2, 2], [1, 1], [1, 2], [2, 0], [2, 3], [1, 0], [1, 3], [0, 1], [0, 2], [0, 0], [0, 3]];
// Overflow agents without a desk hang out in the chill zone.
const LOUNGE = [[-5.0, 3.1, 2.3], [-4.0, 4.2, 2.6], [-6.4, 4.4, 1.2], [5.0, 0.8, -1.2], [5.0, 4.6, -2.0], [7.5, 1.0, -1.8], [-3.6, 5.3, 3.0], [3.4, 5.2, 3.0]];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.room = buildRoom(scene);
    this.effects = new Effects(scene);

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

  update(dt, t, now) {
    this.room.update(dt, t);
    this.box.update(dt, t);
    this.effects.update(dt);
    for (const d of this.desks) d.update(dt, t, now);
  }
}
