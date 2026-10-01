import * as THREE from 'three';
import { glow, mesh } from '../engine/toon.js';
import { SLAP, Wobble, starGeometry } from './slap.js';

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

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

/**
 * Two-bone IK for an arm made of `limb()` segments hanging down from their
 * joints. `target` (where the end of the lower segment goes) and `pole`
 * (where the elbow points) are relative to the shoulder, in its parent's
 * frame. Returns the shoulder's rotation and the elbow's bend about x.
 */
export function solveArm(target, pole, upper, lower) {
  const len = THREE.MathUtils.clamp(target.length(), Math.abs(upper - lower) + 1e-4, upper + lower - 1e-4);
  const d = _d.copy(target).normalize();
  const n = _n.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  const cosA = (upper * upper + len * len - lower * lower) / (2 * upper * len);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // The upper arm hangs along the shoulder's -y and the elbow folds towards +z.
  _y.copy(d).multiplyScalar(-cosA).addScaledVector(n, -sinA);
  _z.copy(d).multiplyScalar(sinA).addScaledVector(n, -cosA);
  _x.crossVectors(_y, _z);
  _e.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  const cosB = (upper * upper + lower * lower - len * len) / (2 * upper * lower);
  return { x: _e.x, y: _e.y, z: _e.z, bend: Math.acos(THREE.MathUtils.clamp(cosB, -1, 1)) - Math.PI };
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

// Slaps ----------------------------------------------------------------------
// Right-click a mascot and a cartoon hand smacks it (world/hand.js). The
// reaction plays on joints the poses never touch (`jolt` above the hips,
// `headJolt` under the neck), so it lands on top of whatever the mascot is
// doing: walking, typing, napping, waving.

const _hit = new THREE.Vector3();
const _r = new THREE.Vector3();
const _tilt = new THREE.Vector3();
const _kick = new THREE.Vector3();

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

    // Each mascot sets these up for slaps: the joints that take the hit, the
    // head the hand aims at (`face`, `faceRadius`), where the dizzy stars
    // circle (`crown`, `crownRadius`), cheeks for the handprint (`marks`,
    // -x then +x), and how hard each part gets thrown.
    this.jolt = null;
    this.headJolt = null;
    this.face = null;
    this.faceRadius = 0.25;
    this.crown = null;
    this.crownRadius = 0.2;
    this.marks = [];
    this.slapFeel = { head: 0.5, body: 0.1, squash: 0.08, spin: false };
    this.slapWords = ['SLAP!', 'SLAP!', 'SMACK!', 'WHAP!'];
    this.slapSparks = 4;
    this.slapT = Infinity;
    this.headWobble = new Wobble(16, 0.3);
    this.bodyWobble = new Wobble(10, 0.35);
    this.squash = new Wobble(18, 0.35);
    this.spin = 0;
    this.spinTarget = 0;
  }

  /** Seconds since the last slap landed, while it's still showing. */
  get flinching() { return this.slapT < SLAP.flinch; }
  get dazed() { return this.slapT >= SLAP.flinch && this.slapT < SLAP.daze; }

  /**
   * The hand just landed. `push` is where it shoves the head and `toward`
   * points at the viewer, both flat and in the root's frame.
   */
  slap(push, toward) {
    this.slapT = 0;
    const { head, body, squash, spin } = this.slapFeel;
    // The hand lands above the neck and in front of it, so the head rolls
    // with the push and turns away from it (or towards it, hit from behind).
    const torque = _r.set(0, 1, 0).addScaledVector(toward, 0.8).cross(push).normalize();
    if (this.headJolt) this.headWobble.kick(_kick.copy(torque).multiplyScalar(head));
    // The body leans with the push and twists a little; with no head to
    // turn (Clawd), it takes the whole twist.
    _tilt.set(push.z, 0, -push.x).normalize().multiplyScalar(body);
    _tilt.y = torque.y * body * (this.headJolt ? 0.6 : 1.6);
    this.bodyWobble.kick(_tilt);
    this.squash.kick(_kick.set(0, squash, 0));
    // A robot head just spins right round.
    if (spin) this.spinTarget += Math.PI * 2 * (torque.y < 0 ? -1 : 1);
    // A handprint on the cheek on the side it landed, unless it hit the back
    // of the head.
    const hit = _hit.copy(push).negate();
    const cheek = Math.abs(hit.x) > 0.3 && hit.z > -0.55 ? this.marks[hit.x < 0 ? 0 : 1] : null;
    for (const m of this.marks) m.visible = m === cheek;
  }

  /** Call first thing in `update`: runs the springs and the slap's props. */
  updateSlap(dt) {
    if (this.slapT === Infinity) return;
    this.slapT += dt;
    const t = this.slapT;
    this.headWobble.step(dt);
    this.bodyWobble.step(dt);
    this.squash.step(dt);
    this.spin = damp(this.spin, this.spinTarget, 5, dt);
    if (Math.abs(this.spinTarget - this.spin) < 0.01) this.spin = this.spinTarget = 0;

    const h = this.headWobble.x;
    this.headJolt?.rotation.set(h.x, h.y + this.spin, h.z);
    const b = this.bodyWobble.x;
    const s = this.squash.x.y;
    if (this.jolt) {
      this.jolt.rotation.set(b.x, b.y, b.z);
      this.jolt.scale.set(1 + s / 2, 1 - s, 1 + s / 2);
    }

    for (const m of this.marks) {
      if (m.visible) m.material.opacity = 0.85 * THREE.MathUtils.clamp((SLAP.mark - t) / 1.5, 0, 1);
    }
    this.updateStars(t, dt);

    if (t > SLAP.mark && this.headWobble.resting && this.bodyWobble.resting && this.squash.resting && !this.spinTarget) {
      this.slapT = Infinity;
      this.headJolt?.rotation.set(0, 0, 0);
      this.jolt?.rotation.set(0, 0, 0);
      this.jolt?.scale.set(1, 1, 1);
      for (const m of this.marks) m.visible = false;
    }
  }

  /** Three little stars circling the head while it's seeing them. */
  updateStars(t, dt) {
    const on = t > 0.12 && t < SLAP.daze;
    if (!on) {
      if (this.stars) this.stars.visible = false;
      return;
    }
    if (!this.stars) {
      this.stars = new THREE.Group();
      this.stars.rotation.x = 0.22;
      for (let i = 0; i < 3; i++) {
        const star = mesh(starGeometry, glow('#ffe14d'), { cast: false, receive: false });
        if (this.agentId) star.userData.agentId = this.agentId;
        this.stars.add(star);
      }
      this.crown.add(this.stars);
    }
    const r = this.crownRadius;
    const grow = Math.min(1, (t - 0.12) / 0.2) * Math.min(1, (SLAP.daze - t) / 0.4);
    this.stars.visible = true;
    this.stars.rotation.y += dt * 5;
    this.stars.children.forEach((star, i) => {
      const a = (i / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * r, Math.sin(t * 9 + i * 2.1) * r * 0.12, Math.sin(a) * r);
      star.rotation.set(0, Math.atan2(Math.cos(a), Math.sin(a)), t * 7 + i);
      star.scale.setScalar(r * 0.36 * grow + 1e-4);
    });
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
    this.agentId = agentId;
    this.root.traverse((o) => { if (o.isMesh) o.userData.agentId = agentId; });
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
