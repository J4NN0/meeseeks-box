import * as THREE from 'three';
import { mesh, noInk, ownToon } from '../engine/toon.js';
import { CharacterBase, bendPoint, joint, pointing } from './rig.js';
import { markMaterial } from './slap.js';

// Clawd, the blocky little critter from Claude Code's welcome screen:
//    ▐▛███▜▌
//   ▝▜█████▛▘
//     ▘▘ ▝▝
// Built from voxels. Too short for an office chair, so it sits on books.

const LEG_H = 0.16;
const BOOSTER_H = 0.24;
const SEAT_H = 0.47;
// Its arms are nubs on its sides, this far up its body.
const ARM = { x: 0.32, y: 0.24 };
// At a meeting table its nubs don't reach the table, so it writes with a
// giant pencil, gripped at the end of its nub, leaning in over the pad
// pulled close and writing small.
const GRIP = 0.13;
const PENCIL = 0.3;
const WRITE_LEAN = 0.3;
const PAD_SPOT = { x: -0.22, z: 0.37 };
const PAGE_SPAN = 0.8;
const WRITE_POLE = new THREE.Vector3(0.8, 0.5, 0.2);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _tip = new THREE.Vector3();
const _joint = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _nub = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Clawd extends CharacterBase {
  constructor({ color = '#d97757', seed = 'clawd' } = {}) {
    super(seed);
    this.kind = 'clawd';
    const body = this.track(ownToon(color));
    const bodyDark = this.track(ownToon(new THREE.Color(color).offsetHSL(0, 0, -0.12)));
    const black = this.track(ownToon('#1b1512'));

    this.headHeight = 0.95;
    this.seatedHeadHeight = SEAT_H + BOOSTER_H + 0.75;

    this.hips = joint(this.root, 0, LEG_H, 0);
    // All head, so a slap throws the whole body (on `jolt`).
    this.jolt = joint(this.hips);
    this.body = joint(this.jolt);
    const torso = mesh(new THREE.BoxGeometry(0.64, 0.44, 0.4), body);
    torso.position.y = 0.26;
    this.body.add(torso);
    const brow = mesh(new THREE.BoxGeometry(0.46, 0.1, 0.4), body);
    brow.position.y = 0.53;
    this.body.add(brow);

    this.eyes = [-1, 1].map((s) => {
      const eye = mesh(new THREE.BoxGeometry(0.07, 0.12, 0.02), black);
      eye.position.set(s * 0.13, 0.36, 0.205);
      this.body.add(eye);
      return eye;
    });
    // Squeezed shut after a slap: > <
    const bar = new THREE.BoxGeometry(0.085, 0.026, 0.02);
    this.squint = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(s * 0.13 - s * 0.028, 0.36, 0.205);
      for (const up of [-1, 1]) {
        const m = mesh(bar, black);
        m.position.set(s * 0.028, up * 0.022, 0);
        m.rotation.z = up * s * 0.64;
        g.add(m);
      }
      g.visible = false;
      this.body.add(g);
      return g;
    });

    this.face = joint(this.body, 0, 0.3, 0);
    this.faceRadius = 0.32;
    this.crown = joint(this.body, 0, 0.68, 0);
    this.crownRadius = 0.26;
    this.slapFeel = { head: 0, body: 0.3, squash: 0.14, spin: false };
    this.marks = [-1, 1].map((s) => {
      const mark = noInk(mesh(new THREE.PlaneGeometry(0.19, 0.19), this.track(markMaterial()), { cast: false, receive: false }));
      mark.position.set(s * 0.215, 0.2, 0.2015);
      // Mirror images: both thumbs towards the middle.
      if (s > 0) mark.scale.x = -1;
      mark.visible = false;
      this.body.add(mark);
      return mark;
    });

    this.arms = [-1, 1].map((s) => {
      const arm = joint(this.body, s * ARM.x, ARM.y, 0);
      const nub = mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), body);
      nub.position.x = s * 0.07;
      arm.add(nub);
      return { arm, s };
    });
    // At a meeting table it writes with a pencil in its -x nub and drinks
    // from a mug at the end of the other, held up in front of its face.
    const [left, right] = this.arms;
    this.grip = joint(left.arm, -GRIP, 0, 0);
    this.pen = giantPencil(this);
    this.grip.add(this.pen);
    this.padSpot = PAD_SPOT;
    this.cupHand = joint(right.arm, 0.14, 0, 0);
    this.cupOffset.set(-0.12, -0.1, 0.17);

    this.legs = [-0.22, -0.11, 0.11, 0.22].map((x, i) => {
      const leg = joint(this.hips, x, 0.02, 0);
      const m = mesh(new THREE.BoxGeometry(0.065, LEG_H + 0.02, 0.1), bodyDark);
      m.position.y = -LEG_H / 2;
      leg.add(m);
      return { leg, i };
    });

    // A stack of textbooks to reach the keyboard.
    this.booster = new THREE.Group();
    const books = ['#3d5a80', '#ee6c4d', '#98c1d9'];
    books.forEach((c, i) => {
      const b = mesh(new THREE.BoxGeometry(0.5 - i * 0.04, BOOSTER_H / 3, 0.36 - i * 0.02), ownToon(c));
      b.position.y = -BOOSTER_H + (i + 0.5) * (BOOSTER_H / 3);
      b.rotation.y = (i - 1) * 0.12;
      this.track(b.material);
      this.booster.add(b);
    });
    this.booster.visible = false;
    this.root.add(this.booster);
  }

  update(dt, t) {
    const p = this.poser;
    const time = t + this.offset;
    this.updateSlap(dt);
    const blinking = this.updateBlink(dt);
    const [L, R] = this.arms;
    let eyeY = blinking ? 0.15 : 1;
    let squash = 1;
    let hipY = LEG_H;
    let hipX = 0;
    this.booster.visible = this.mode === 'sit';

    if (this.mode === 'walk') {
      this.walkPhase += dt * 12;
      const w = this.walkPhase;
      hipY = LEG_H + Math.abs(Math.sin(w)) * 0.05;
      for (const { leg, i } of this.legs) p.rot(leg, Math.sin(w + (i % 2) * Math.PI) * 0.6, 0, 0);
      p.rot(L.arm, 0, 0, -0.2 - Math.sin(w) * 0.3).rot(R.arm, 0, 0, 0.2 + Math.sin(w) * 0.3);
      p.rot(this.body, 0.05, 0, Math.sin(w) * 0.05);
    } else if (this.mode === 'stand') {
      for (const { leg } of this.legs) p.rot(leg, 0, 0, 0);
      if (this.mood === 'cheer') {
        hipY = LEG_H + Math.abs(Math.sin(time * 6)) * 0.14;
        p.rot(L.arm, 0, 0, -1.2 - Math.sin(time * 12) * 0.3).rot(R.arm, 0, 0, 1.2 + Math.sin(time * 12) * 0.3);
      } else {
        squash = 1 + Math.sin(time * 2) * 0.02;
        p.rot(L.arm, 0, 0, -0.1).rot(R.arm, 0, 0, 0.1);
      }
      p.rot(this.body, 0, 0, 0);
    } else {
      // Sitting on the books: legs stick straight out, like a toddler.
      hipY = SEAT_H + BOOSTER_H - 0.02;
      for (const { leg } of this.legs) p.rot(leg, -1.45, 0, 0);
      if (this.table && (this.mood === 'work' || this.mood === 'think' || this.mood === 'sip')) {
        // At a meeting table: leaning in over its notes, and now and then some coffee.
        const sip = this.mood === 'sip' ? this.sip : 0;
        this.writePose(p, dt, time, L, hipY, this.mood === 'think' ? { tap: true } : { rate: this.mood === 'sip' ? 0 : 1 });
        if (this.mood === 'sip') p.rot(R.arm, -0.2 - sip * 0.1, -0.7 - sip * 0.75, 0.15 + sip * 0.2);
        else p.rot(R.arm, -0.3, -0.2, 0.15);
        p.rot(this.body, WRITE_LEAN, 0, 0);
      } else if (this.mood === 'work' || this.mood === 'think') {
        const a = Math.sin(time * 16) * 0.35;
        p.rot(L.arm, -0.9 + a, 0.5, -0.2).rot(R.arm, -0.9 - a, -0.5, 0.2);
        p.rot(this.body, 0.12, 0, 0);
        if (this.mood === 'think') p.rot(this.body, 0.02, 0, Math.sin(time * 1.5) * 0.08).rot(R.arm, -0.2, 0, 0.6);
        hipY += Math.abs(Math.sin(time * 8)) * 0.012;
      } else if (this.mood === 'wait') {
        hipY += Math.abs(Math.sin(time * 5)) * 0.07;
        p.rot(L.arm, 0, 0, -1.3 - Math.sin(time * 10) * 0.35).rot(R.arm, 0, 0, 1.3 + Math.sin(time * 10) * 0.35);
        p.rot(this.body, -0.05, 0, 0);
      } else if (this.mood === 'sleep') {
        eyeY = 0.12;
        squash = 0.9 + Math.sin(time * 1.4) * 0.03;
        p.rot(L.arm, 0.2, 0, 0.3).rot(R.arm, 0.2, 0, -0.3).rot(this.body, 0.2, 0, 0.1);
      } else if (this.mood === 'stress') {
        hipX = Math.sin(time * 45) * 0.02;
        const f = Math.sin(time * 28);
        p.rot(L.arm, -1.0 + f * 0.6, 0, -0.9).rot(R.arm, -1.0 - f * 0.6, 0, 0.9);
        p.rot(this.body, 0.05, Math.sin(time * 20) * 0.08, 0);
        eyeY = 1.2;
      } else {
        p.rot(L.arm, 0, 0, -0.1).rot(R.arm, 0, 0, 0.1).rot(this.body, 0, 0, 0);
      }
    }

    p.pos(this.hips, hipX, hipY, 0);
    p.apply(dt, this.mode === 'walk' ? 18 : 12);
    this.body.scale.y = THREE.MathUtils.damp(this.body.scale.y, squash, 12, dt);
    this.booster.position.y = SEAT_H + BOOSTER_H;
    // Slapped: > < for a moment, then wide eyes wobbling about.
    const flinch = this.flinching;
    const dizzy = this.dazed;
    if (dizzy) eyeY = 1.2;
    this.eyes.forEach((e, i) => {
      e.visible = !flinch;
      e.scale.y = THREE.MathUtils.damp(e.scale.y, eyeY, 25, dt);
      const roll = time * 11 + i * Math.PI;
      e.position.x = (i ? 0.13 : -0.13) + (dizzy ? Math.cos(roll) * 0.014 : 0);
      e.position.y = 0.36 + (dizzy ? Math.sin(roll) * 0.014 : 0);
    });
    for (const g of this.squint) g.visible = flinch;
  }

  /**
   * Writing on the pad (leaning in by WRITE_LEAN): the pencil's tip on the
   * paper where penTip says, the nub swung out to grip it and the pencil
   * turned in its grip to reach. `hipY` is where its hips are.
   */
  writePose(p, dt, time, { arm, s }, hipY, how) {
    this.penAt(dt, time, { ...how, span: PAGE_SPAN }, _tip);
    // In the leaning body's frame: the tip, the nub's joint, and where the
    // grip goes between them.
    _tip.y -= hipY;
    _tip.applyAxisAngle(X_AXIS, -WRITE_LEAN);
    _joint.set(s * ARM.x, ARM.y, 0);
    bendPoint(_joint, _tip, GRIP, PENCIL, _pole.set(s * WRITE_POLE.x, WRITE_POLE.y, WRITE_POLE.z), _grip);
    _q.setFromUnitVectors(_nub.set(s, 0, 0), _dir.copy(_grip).sub(_joint).normalize());
    p.turn(arm, _q);
    p.turn(this.grip, pointing(_q, _dir.copy(_tip).sub(_grip).normalize()));
  }
}

/** A giant yellow pencil, for a little critter whose nubs don't reach the table: its point PENCIL down its grip's -y. */
function giantPencil(clawd) {
  const g = new THREE.Group();
  const own = (color) => clawd.track(ownToon(color));
  const length = PENCIL - 0.05;
  const barrel = mesh(new THREE.CylinderGeometry(0.017, 0.017, length, 6), own('#f4c430'));
  barrel.position.y = 0.06 - length / 2;
  g.add(barrel);
  const band = mesh(new THREE.CylinderGeometry(0.0175, 0.0175, 0.02, 12), own('#b8bec7'));
  band.position.y = 0.07;
  g.add(band);
  const eraser = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.025, 12), own('#f29bb2'));
  eraser.position.y = 0.0925;
  g.add(eraser);
  const wood = mesh(new THREE.ConeGeometry(0.017, 0.05, 6), own('#e9c79f'));
  wood.rotation.x = Math.PI;
  wood.position.y = 0.06 - length - 0.025;
  g.add(wood);
  const point = mesh(new THREE.ConeGeometry(0.0055, 0.016, 8), own('#2b2b30'));
  point.rotation.x = Math.PI;
  point.position.y = -PENCIL + 0.008;
  g.add(point);
  g.visible = false;
  return g;
}
