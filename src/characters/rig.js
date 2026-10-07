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

// Writing at a meeting table -----------------------------------------------------

/**
 * The page of a pad, in its own terms: `across` runs from the margin to the
 * right-hand edge, `down` from the top line (by the binding, away from the
 * writer) to the bottom one, in metres from the pad's middle.
 */
const PAGE = { left: -0.045, right: 0.065, top: -0.07, bottom: 0.08, lines: 5 };
/** Seconds to write a line at rate 1. */
const LINE_S = 2.6;
/** The way a pen points from the hand holding it to its tip, in the writer's frame (for the -x hand): down onto the paper, tipped away and in. */
export const PEN_DIR = new THREE.Vector3(0.22, -0.86, 0.46).normalize();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Where the tip of the pen goes on the pad, in the writer's frame, after
 * `written` seconds of writing: along each line from the margin, a line at
 * a time from the top, lifting between words and back to the margin for the
 * next line. `tap`, a clock, taps it up and down where it is instead, and
 * `span` shrinks the page to what a short arm can reach. `table` is the one
 * setTable gets: the pad's middle (`pad`, on the paper) and its turn.
 */
export function penTip(table, written, { tap = null, span = 1 }, out) {
  const t = written / LINE_S;
  const n = Math.floor(t);
  const k = t - n;
  const lineDown = (i) => PAGE.top + ((i % PAGE.lines) / (PAGE.lines - 1)) * (PAGE.bottom - PAGE.top);
  let across;
  let down;
  let lift;
  if (k > 0.86) {
    // End of the line: pen up and back to the margin, one line down.
    const r = (k - 0.86) / 0.14;
    across = 1 - r;
    down = THREE.MathUtils.lerp(lineDown(n), lineDown(n + 1), r);
    lift = Math.sin(r * Math.PI) * 0.02 + 0.004;
  } else {
    const w = written * 14;
    across = k / 0.86 + Math.sin(w) * 0.04;
    down = lineDown(n) + Math.cos(w) * 0.004;
    // Off the paper for a moment between words.
    lift = Math.max(0, Math.sin(written * 2.2) - 0.82) * 0.06;
  }
  if (tap !== null) lift = Math.max(lift, Math.sin(tap * 4.5) * 0.03);
  const mid = (PAGE.left + PAGE.right) / 2;
  const x = (mid + (across - 0.5) * (PAGE.right - PAGE.left)) * span;
  const z = down * span;
  // Page to writer: the pad's own little turn, then round to face the writer.
  const c = Math.cos(table.padTurn || 0);
  const sn = Math.sin(table.padTurn || 0);
  const { pad } = table;
  return out.set(pad.x - (x * c + z * sn), pad.y + 0.001 + lift, pad.z - (-x * sn + z * c));
}

const _aim = new THREE.Quaternion();
const _inv = new THREE.Quaternion();

/**
 * The rotation for a joint (a hand, a claw) whose parent chain turns by
 * `chain`, so that its -y points along `dir`: the way a pen held in it
 * points. A quaternion, for the Poser's turn().
 */
export function pointing(chain, dir) {
  _aim.setFromUnitVectors(DOWN, dir);
  return _inv.copy(chain).invert().multiply(_aim);
}

const _bd = new THREE.Vector3();
const _bn = new THREE.Vector3();

/**
 * Two bones from `from` towards `to`, `a` and `b` long: where the joint
 * between them goes, bent towards `pole`.
 */
export function bendPoint(from, to, a, b, pole, out) {
  const d = _bd.copy(to).sub(from);
  const len = THREE.MathUtils.clamp(d.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  d.normalize();
  const n = _bn.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  return out.copy(from).addScaledVector(d, a * cosA).addScaledVector(n, a * Math.sqrt(1 - cosA * cosA));
}

/**
 * A ballpoint pen, held in a hand that's a joint at the end of a limb: it
 * runs on along the limb (its -y), the tip `reach` past the joint. Hidden
 * until it sits down at a meeting table.
 */
export function heldPen(material, tipMaterial, reach = 0.11) {
  const g = new THREE.Group();
  const barrel = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), material);
  barrel.position.y = -reach + 0.075;
  g.add(barrel);
  const tip = mesh(new THREE.ConeGeometry(0.008, 0.016, 8), tipMaterial);
  tip.rotation.x = Math.PI;
  tip.position.y = -reach + 0.008;
  g.add(tip);
  g.visible = false;
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
    this.turns = new Map();
  }

  rot(obj, x = 0, y = 0, z = 0) {
    this.targets.set(obj, { x, y, z, pos: this.targets.get(obj)?.pos });
    return this;
  }

  /**
   * Turns `obj` towards a rotation given as a quaternion, easing along the
   * shortest way round: for joints aimed at something (a pen at the paper),
   * where easing each Euler angle on its own could swing them right round.
   */
  turn(obj, q) {
    let to = this.turns.get(obj);
    if (!to) this.turns.set(obj, (to = new THREE.Quaternion()));
    this.targets.set(obj, { q: to.copy(q), pos: this.targets.get(obj)?.pos });
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
      if (t.q) {
        obj.quaternion.slerp(t.q, 1 - Math.exp(-speed * dt));
      } else {
        obj.rotation.x = damp(obj.rotation.x, t.x, speed, dt);
        obj.rotation.y = damp(obj.rotation.y, t.y, speed, dt);
        obj.rotation.z = damp(obj.rotation.z, t.z, speed, dt);
      }
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
const _cup = new THREE.Vector3();
const _rootQ = new THREE.Quaternion();
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

    // At a meeting table (`setTable`): where its notepad and mug are, in its
    // own frame. It takes notes with `pen` and drinks with `cupHand`: `sip`
    // is how far the mug is lifted, 0 (on the table) to 1 (at its mouth),
    // and `cupOffset` where the mug's middle is from that hand.
    this.table = null;
    this.pen = null;
    // Where it wants its pad, if its arms don't reach the usual spot ({ x, z }, its own frame).
    this.padSpot = null;
    this.sip = 0;
    // Seconds of notes it's written on the pad: where its pen is on the page.
    this.written = 0;
    this.cupHand = null;
    this.cupOffset = new THREE.Vector3();

    // On its feet at the coffee bar, its cup hand busy: reaching for
    // something (`grab`, where the hand goes, in its own frame), or holding
    // a mug or a fruit (`carrying`, `cupOffset` from the hand), up at its
    // mouth as `sip` goes to 1. `chew` works its jaw; with `gesture` on it
    // talks with its other hand.
    this.grab = null;
    this.carrying = false;
    this.chew = false;
    this.gesture = false;
  }

  /** Sat down at a meeting table (its `{ pad, cup }`), or back at a desk (null). */
  setTable(table) {
    this.table = table;
    this.sip = 0;
    if (this.pen) this.pen.visible = !!table;
  }

  /**
   * Where the tip of its pen goes this frame (penTip): writing on at `rate`
   * (0 holds it where it is), or tapping on the spot with `tap`.
   */
  penAt(dt, time, { rate = 1, tap = false, span = 1 }, out) {
    if (!tap) this.written += dt * rate;
    return penTip(this.table, this.written, { tap: tap ? time : null, span }, out);
  }

  /** Where the mug it's drinking from is, in world space: in its hand. */
  cupWorld(out) {
    this.cupHand.getWorldPosition(out);
    return out.add(_cup.copy(this.cupOffset).applyQuaternion(this.root.getWorldQuaternion(_rootQ)));
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
