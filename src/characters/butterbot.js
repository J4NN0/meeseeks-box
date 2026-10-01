import * as THREE from 'three';
import { mesh, ownToon } from '../engine/toon.js';
import { CharacterBase, joint, limb } from './rig.js';

// A butter-passing robot that has been promoted to software engineer.
// "What is my purpose?" "You write code." "Oh my god."

const SEAT_H = 0.47;
const BOOSTER_H = 0.2;

export class ButterBot extends CharacterBase {
  constructor({ color = '#6ec6ee', seed = 'bot' } = {}) {
    super(seed);
    this.kind = 'butterbot';
    const steel = this.track(ownToon('#c9ced6'));
    const steelDark = this.track(ownToon('#7c848f'));
    const accent = this.track(ownToon(color));
    const black = this.track(ownToon('#1d1f24'));
    this.eyeMat = this.track(new THREE.MeshBasicMaterial({ color: '#8ff7ff' }));
    this.eyeOn = new THREE.Color('#8ff7ff');
    this.eyeAngry = new THREE.Color('#ff4d4d');
    this.eyeOff = new THREE.Color('#2a3a40');

    this.headHeight = 0.9;
    this.seatedHeadHeight = SEAT_H + BOOSTER_H + 0.75;

    this.hips = joint(this.root, 0, 0, 0);
    this.slapFeel = { head: 0.35, body: 0.14, squash: 0.1, spin: true };
    this.slapWords = ['CLANG!', 'BONK!', 'CLANG!'];
    this.slapSparks = 12;

    // Tank treads.
    this.treads = [-1, 1].map((s) => {
      const tread = mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 10), black);
      tread.rotation.x = Math.PI / 2;
      tread.position.set(s * 0.14, 0.055, 0);
      this.hips.add(tread);
      const wheel = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12), steelDark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(s * 0.14, 0.055, 0);
      this.hips.add(wheel);
      return tread;
    });

    // Slaps rock the body on `jolt` and send the head spinning on `headJolt`.
    this.jolt = joint(this.hips, 0, 0.11, 0);
    this.body = joint(this.jolt);
    const base = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.3), steelDark);
    base.position.y = 0.02;
    this.body.add(base);
    const chassis = mesh(new THREE.BoxGeometry(0.3, 0.22, 0.28), steel);
    chassis.position.y = 0.16;
    this.body.add(chassis);
    const panel = mesh(new THREE.BoxGeometry(0.2, 0.12, 0.02), accent);
    panel.position.set(0, 0.17, 0.145);
    this.body.add(panel);
    for (let i = 0; i < 3; i++) {
      const led = mesh(new THREE.BoxGeometry(0.025, 0.025, 0.02), i === 1 ? this.eyeMat : black);
      led.position.set(-0.05 + i * 0.05, 0.17, 0.158);
      this.body.add(led);
    }

    this.neck = joint(this.body, 0, 0.27, 0);
    const neck = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 10), steelDark);
    neck.position.y = 0.04;
    this.neck.add(neck);
    this.headJolt = joint(this.neck, 0, 0.08, 0);
    this.head = joint(this.headJolt);
    this.face = joint(this.head, 0, 0.07, 0);
    this.faceRadius = 0.12;
    this.crown = joint(this.head, 0, 0.29, 0);
    this.crownRadius = 0.14;
    const dome = mesh(new THREE.SphereGeometry(0.1, 20, 14), steel);
    dome.scale.set(1.2, 0.85, 1);
    dome.position.y = 0.07;
    this.head.add(dome);
    const lensRing = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 18), black);
    lensRing.rotation.x = Math.PI / 2;
    lensRing.position.set(0, 0.07, 0.09);
    this.head.add(lensRing);
    this.eye = mesh(new THREE.SphereGeometry(0.035, 14, 10), this.eyeMat);
    this.eye.position.set(0, 0.07, 0.108);
    this.head.add(this.eye);
    const antenna = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6), steelDark);
    antenna.position.set(0.06, 0.18, 0);
    this.head.add(antenna);
    const tip = mesh(new THREE.SphereGeometry(0.018, 8, 8), accent);
    tip.position.set(0.06, 0.235, 0);
    this.head.add(tip);

    this.arms = [-1, 1].map((s) => {
      const shoulder = joint(this.body, s * 0.165, 0.22, 0);
      shoulder.add(limb(0.16, 0.018, steelDark, 6));
      const elbow = joint(shoulder, 0, -0.16, 0);
      elbow.add(limb(0.14, 0.016, steelDark, 6));
      const claw = joint(elbow, 0, -0.15, 0);
      for (const c of [-1, 1]) {
        const finger = mesh(new THREE.BoxGeometry(0.012, 0.05, 0.02), steel);
        finger.position.set(c * 0.014, -0.02, 0);
        finger.rotation.z = c * 0.3;
        claw.add(finger);
      }
      return { shoulder, elbow, s };
    });

    this.booster = new THREE.Group();
    const crate = mesh(new THREE.BoxGeometry(0.46, BOOSTER_H, 0.4), this.track(ownToon('#c89b62')));
    crate.position.y = -BOOSTER_H / 2;
    this.booster.add(crate);
    const label = mesh(new THREE.BoxGeometry(0.2, 0.08, 0.01), this.track(ownToon('#f5e6a8')));
    label.position.set(0, -BOOSTER_H / 2, 0.205);
    this.booster.add(label);
    this.booster.visible = false;
    this.root.add(this.booster);
  }

  update(dt, t) {
    const p = this.poser;
    const time = t + this.offset;
    this.updateSlap(dt);
    const [L, R] = this.arms;
    let eye = this.eyeOn;
    let hipY = 0;
    let hipX = 0;
    this.booster.visible = this.mode === 'sit';
    if (this.updateBlink(dt)) eye = this.eyeOff;

    if (this.mode === 'sit') hipY = SEAT_H + BOOSTER_H;

    if (this.mode === 'walk') {
      this.walkPhase += dt * 10;
      hipY = Math.abs(Math.sin(this.walkPhase)) * 0.015;
      p.rot(this.body, 0.08, 0, Math.sin(this.walkPhase) * 0.03).rot(this.head, -0.05, 0, 0);
      p.rot(L.shoulder, -0.3, 0, -0.3).rot(L.elbow, -0.6, 0, 0).rot(R.shoulder, -0.3, 0, 0.3).rot(R.elbow, -0.6, 0, 0);
    } else if (this.mood === 'cheer' || (this.mode === 'sit' && this.mood === 'wait')) {
      // "What is my purpose?"
      p.rot(this.body, -0.05, 0, 0).rot(this.head, -0.25, Math.sin(time * 1.5) * 0.35, Math.sin(time * 3) * 0.1);
      p.rot(L.shoulder, 0, 0, -2.3 - Math.sin(time * 6) * 0.2).rot(L.elbow, -0.4, 0, 0);
      p.rot(R.shoulder, 0, 0, 2.3 + Math.sin(time * 6) * 0.2).rot(R.elbow, -0.4, 0, 0);
      hipY += Math.abs(Math.sin(time * 4)) * 0.03;
    } else if (this.mode === 'sit' && (this.mood === 'work' || this.mood === 'think')) {
      const a = Math.sin(time * 18) * 0.12;
      p.rot(this.body, 0.1, 0, 0).rot(this.head, 0.2, Math.sin(time * 0.8) * 0.2, 0);
      p.rot(L.shoulder, -1.1 + a, 0.2, -0.1).rot(L.elbow, -0.7 - a, 0, 0);
      p.rot(R.shoulder, -1.1 - a, -0.2, 0.1).rot(R.elbow, -0.7 + a, 0, 0);
      if (this.mood === 'think') p.rot(this.head, 0.05, 0.4, 0.2);
    } else if (this.mode === 'sit' && this.mood === 'sleep') {
      eye = this.eyeOff;
      p.rot(this.body, 0.15, 0, 0).rot(this.head, 0.6, 0, 0.2);
      p.rot(L.shoulder, 0.1, 0, -0.1).rot(L.elbow, 0, 0, 0).rot(R.shoulder, 0.1, 0, 0.1).rot(R.elbow, 0, 0, 0);
    } else if (this.mode === 'sit' && this.mood === 'stress') {
      eye = Math.sin(time * 12) > 0 ? this.eyeAngry : this.eyeOn;
      hipX = Math.sin(time * 50) * 0.012;
      const f = Math.sin(time * 26) * 0.5;
      p.rot(this.body, 0.05, Math.sin(time * 18) * 0.1, 0).rot(this.head, -0.1, Math.sin(time * 14) * 0.4, 0);
      p.rot(L.shoulder, -1.4 + f, 0, -0.6).rot(L.elbow, -0.9, 0, 0).rot(R.shoulder, -1.4 - f, 0, 0.6).rot(R.elbow, -0.9, 0, 0);
    } else {
      p.rot(this.body, 0, 0, 0).rot(this.head, 0, Math.sin(time * 0.6) * 0.5, 0);
      p.rot(L.shoulder, 0, 0, -0.2).rot(L.elbow, -0.4, 0, 0).rot(R.shoulder, 0, 0, 0.2).rot(R.elbow, -0.4, 0, 0);
    }

    // Slapped: the eye flashes red, then glitches while the head spins back.
    let snap = false;
    if (this.flinching) {
      eye = this.eyeAngry;
      snap = true;
    } else if (this.dazed) {
      eye = Math.sin(time * 23) + Math.sin(time * 37) > 0.9 ? this.eyeOff : this.eyeOn;
      snap = true;
    }

    p.pos(this.hips, hipX, hipY, 0);
    p.apply(dt, 12);
    this.booster.position.y = SEAT_H + BOOSTER_H;
    if (snap) this.eyeMat.color.copy(eye);
    else this.eyeMat.color.lerp(eye, 1 - Math.exp(-20 * dt));
  }
}
