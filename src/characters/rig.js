import * as THREE from 'three';
import { mesh } from '../engine/toon.js';

const { damp } = THREE.MathUtils;

/** A limb segment hanging down from its joint (the joint is the group origin). */
export function limb(length, radius, material, segments = 10) {
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, segments);
  const m = mesh(g, material);
  m.position.y = -length / 2;
  return m;
}

export function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * Collects pose targets for a frame and eases every joint toward them, so any
 * switch between poses (sit → wave, work → panic) blends instead of popping.
 */
export class Poser {
  constructor() {
    this.targets = new Map();
  }

  rot(obj, x = 0, y = 0, z = 0) {
    this.targets.set(obj, { x, y, z, pos: this.targets.get(obj)?.pos });
    return this;
  }

  pos(obj, x, y, z) {
    const t = this.targets.get(obj) || { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z };
    t.pos = { x, y, z };
    this.targets.set(obj, t);
    return this;
  }

  apply(dt, speed = 10) {
    for (const [obj, t] of this.targets) {
      obj.rotation.x = damp(obj.rotation.x, t.x, speed, dt);
      obj.rotation.y = damp(obj.rotation.y, t.y, speed, dt);
      obj.rotation.z = damp(obj.rotation.z, t.z, speed, dt);
      if (t.pos) {
        obj.position.x = damp(obj.position.x, t.pos.x, speed, dt);
        obj.position.y = damp(obj.position.y, t.pos.y, speed, dt);
        obj.position.z = damp(obj.position.z, t.pos.z, speed, dt);
      }
    }
  }
}

/** Shared bookkeeping for every mascot: materials for highlight, blink timers. */
export class CharacterBase {
  constructor(seed) {
    this.root = new THREE.Group();
    this.mode = 'stand'; // stand | walk | sit
    this.mood = 'idle'; // idle | cheer | work | think | wait | sleep | stress
    this.talking = false;
    this.walkPhase = 0;
    this.poser = new Poser();
    this.materials = [];
    this.nextBlink = 1 + Math.random() * 3;
    this.blink = 0;
    this.seed = seed;
    this.offset = Math.random() * 100;
  }

  setMode(mode) { this.mode = mode; }
  setMood(mood) { this.mood = mood; }

  track(material) {
    this.materials.push(material);
    return material;
  }

  setHighlight(on) {
    for (const m of this.materials) {
      if (m.emissive) m.emissive.setScalar(on ? 0.12 : 0);
    }
  }

  updateBlink(dt) {
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.14;
      this.nextBlink = 2 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt);
    return this.blink > 0;
  }

  /** Marks every mesh so a raycast hit can be traced back to its agent. */
  tag(agentId) {
    this.root.traverse((o) => { if (o.isMesh) o.userData.agentId = agentId; });
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
