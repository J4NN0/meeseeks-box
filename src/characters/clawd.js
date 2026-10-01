import * as THREE from 'three';
import { mesh, noInk, ownToon } from '../engine/toon.js';
import { CharacterBase, joint } from './rig.js';
import { markMaterial } from './slap.js';

// Clawd, the blocky little critter from Claude Code's welcome screen:
//    ▐▛███▜▌
//   ▝▜█████▛▘
//     ▘▘ ▝▝
// Built from voxels. Too short for an office chair, so it sits on books.

const LEG_H = 0.16;
const BOOSTER_H = 0.24;
const SEAT_H = 0.47;

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
      const arm = joint(this.body, s * 0.32, 0.24, 0);
      const nub = mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), body);
      nub.position.x = s * 0.07;
      arm.add(nub);
      return { arm, s };
    });

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
      if (this.mood === 'work' || this.mood === 'think') {
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
}
