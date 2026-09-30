import * as THREE from 'three';
import { mesh, ownToon, rng } from '../engine/toon.js';
import { CharacterBase, joint, limb } from './rig.js';

// Mr. Meeseeks: tall, lanky, big round head, one tuft of hair.
// Local space: feet on y = 0, facing +z.

const HIP_STAND = 0.82;
const HIP_SIT = 0.47;
const ACCESSORIES = ['none', 'headphones', 'beanie', 'cap', 'glasses', 'none', 'headphones', 'tie'];

export class Meeseeks extends CharacterBase {
  constructor({ color = '#6ec6ee', seed = 'meeseeks', accessory } = {}) {
    super(seed);
    this.kind = 'meeseeks';
    const r = rng(seed);
    const skinColor = new THREE.Color(color);
    const skin = this.track(ownToon(skinColor));
    const skinDark = this.track(ownToon(skinColor.clone().offsetHSL(0, 0.02, -0.14)));
    const white = this.track(ownToon('#fbfbf6'));
    const black = this.track(ownToon('#171311'));
    const mouthMat = this.track(ownToon('#5c1a22'));
    const tongueMat = this.track(ownToon('#e8747c'));

    this.headHeight = 1.95;
    this.seatedHeadHeight = 1.58;

    // Hips and legs ----------------------------------------------------------
    const hips = joint(this.root, 0, HIP_STAND, 0);
    const pelvis = mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
    pelvis.scale.set(1, 0.7, 0.85);
    hips.add(pelvis);
    this.hips = hips;

    this.legs = [-1, 1].map((s) => {
      const hip = joint(hips, s * 0.075, -0.02, 0);
      hip.add(limb(0.42, 0.045, skin));
      const knee = joint(hip, 0, -0.42, 0);
      knee.add(limb(0.38, 0.04, skin));
      const foot = mesh(new THREE.SphereGeometry(0.06, 14, 10), skin);
      foot.scale.set(0.85, 0.5, 1.6);
      foot.position.set(0, -0.39, 0.05);
      knee.add(foot);
      return { hip, knee, s };
    });

    // Torso ----------------------------------------------------------------
    const chest = joint(hips, 0, 0.02, 0);
    this.chest = chest;
    const profile = [
      [0, 0], [0.12, 0.01], [0.135, 0.08], [0.13, 0.2], [0.145, 0.33], [0.155, 0.42], [0.135, 0.5], [0.1, 0.56], [0, 0.6],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = mesh(new THREE.LatheGeometry(profile, 24), skin);
    torso.scale.z = 0.82;
    chest.add(torso);

    // Head -----------------------------------------------------------------
    const head = joint(chest, 0, 0.5, 0);
    this.head = head;
    const skull = mesh(new THREE.SphereGeometry(0.25, 32, 24), skin);
    skull.scale.set(1, 1.12, 0.92);
    skull.position.y = 0.25;
    head.add(skull);

    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(0.05, 12, 10), skin);
      ear.scale.set(0.45, 1, 0.8);
      ear.position.set(s * 0.245, 0.24, -0.01);
      head.add(ear);
    }

    // Eyes: big white discs with small, slightly derpy pupils.
    this.eyes = [-1, 1].map((s) => {
      const eye = new THREE.Group();
      eye.position.set(s * 0.088, 0.31, 0.188);
      const ball = mesh(new THREE.SphereGeometry(0.074, 20, 16), white);
      ball.scale.z = 0.55;
      eye.add(ball);
      const pupil = mesh(new THREE.SphereGeometry(0.021, 12, 10), black);
      pupil.scale.z = 0.5;
      pupil.position.set(-s * 0.012 + (r() - 0.5) * 0.012, (r() - 0.5) * 0.012, 0.038);
      eye.add(pupil);
      eye.userData.pupil = pupil;
      eye.userData.pupilHome = pupil.position.clone();
      head.add(eye);
      return eye;
    });

    const mouth = new THREE.Group();
    mouth.position.set(0, 0.14, 0.19);
    const mouthHole = mesh(new THREE.SphereGeometry(1, 20, 12), mouthMat);
    mouthHole.scale.set(0.105, 0.05, 0.05);
    mouth.add(mouthHole);
    const tongue = mesh(new THREE.SphereGeometry(1, 14, 10), tongueMat);
    tongue.scale.set(0.05, 0.022, 0.03);
    tongue.position.set(0, -0.022, 0.018);
    mouth.add(tongue);
    head.add(mouth);
    this.mouth = mouth;

    // Hair tuft.
    const hair = new THREE.Group();
    const strands = 3 + Math.floor(r() * 2);
    for (let i = 0; i < strands; i++) {
      const dx = (i - (strands - 1) / 2) * 0.03;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(dx * 0.4, 0.5, 0),
        new THREE.Vector3(dx * 1.2, 0.6, 0.015),
        new THREE.Vector3(dx * 2.4 + (r() - 0.5) * 0.03, 0.68 + r() * 0.03, -0.02),
      ]);
      hair.add(mesh(new THREE.TubeGeometry(curve, 10, 0.011, 6), skinDark));
    }
    head.add(hair);
    this.hair = hair;

    // Arms -----------------------------------------------------------------
    this.arms = [-1, 1].map((s) => {
      const shoulder = joint(chest, s * 0.15, 0.43, 0);
      shoulder.add(limb(0.31, 0.034, skin));
      const elbow = joint(shoulder, 0, -0.31, 0);
      elbow.add(limb(0.28, 0.031, skin));
      const hand = joint(elbow, 0, -0.29, 0);
      const palm = mesh(new THREE.SphereGeometry(0.052, 14, 10), skin);
      palm.scale.set(0.85, 1.15, 0.6);
      hand.add(palm);
      const thumb = limb(0.06, 0.016, skin, 6);
      const thumbJoint = joint(hand, -s * 0.035, 0.01, 0.015);
      thumbJoint.rotation.z = -s * 0.7;
      thumbJoint.add(thumb);
      return { shoulder, elbow, hand, s };
    });

    this.accessory = accessory || ACCESSORIES[Math.floor(r() * ACCESSORIES.length)];
    this.addAccessory(this.accessory, r);
  }

  addAccessory(kind, r) {
    const accentColors = ['#f25f5c', '#ffe066', '#70c1b3', '#247ba0', '#9b5de5', '#f15bb5', '#2b2d42'];
    const accent = this.track(ownToon(accentColors[Math.floor(r() * accentColors.length)]));
    const dark = this.track(ownToon('#2b2b30'));
    const head = this.head;

    if (kind === 'headphones') {
      const band = mesh(new THREE.TorusGeometry(0.27, 0.018, 8, 28, Math.PI), dark);
      band.position.y = 0.27;
      head.add(band);
      for (const s of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 18), accent);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(s * 0.255, 0.25, 0);
        head.add(cup);
      }
    } else if (kind === 'beanie' || kind === 'cap') {
      this.hair.visible = false;
      const dome = mesh(new THREE.SphereGeometry(0.262, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), accent);
      dome.scale.set(1, 1.12, 0.94);
      dome.position.y = 0.26;
      head.add(dome);
      if (kind === 'beanie') {
        const rim = mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 28), accent);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.46;
        rim.scale.set(1, 0.94, 1);
        head.add(rim);
        const pom = mesh(new THREE.SphereGeometry(0.05, 12, 10), this.track(ownToon('#fbfbf6')));
        pom.position.y = 0.56;
        head.add(pom);
      } else {
        // Worn backwards, obviously. This is a startup.
        const brim = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.018, 20, 1, false, 0, Math.PI), accent);
        brim.scale.set(1, 1, 1.1);
        brim.position.set(0, 0.45, -0.16);
        brim.rotation.y = Math.PI / 2;
        brim.rotation.x = 0.15;
        head.add(brim);
      }
    } else if (kind === 'glasses') {
      for (const s of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 24), dark);
        ring.position.set(s * 0.088, 0.31, 0.225);
        head.add(ring);
      }
      const bridge = mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), dark);
      bridge.position.set(0, 0.32, 0.23);
      head.add(bridge);
    } else if (kind === 'tie') {
      const tie = mesh(new THREE.ConeGeometry(0.04, 0.26, 4), accent);
      tie.rotation.x = Math.PI;
      tie.position.set(0, 0.32, 0.125);
      tie.scale.z = 0.35;
      this.chest.add(tie);
    }
  }

  update(dt, t) {
    const p = this.poser;
    const time = t + this.offset;
    const [L, R] = this.arms; // L is the -x arm, R the +x arm
    const [LL, RL] = this.legs;
    const blinking = this.updateBlink(dt);
    let eyeScale = blinking ? 0.1 : 1;
    let mouthOpen = 0.35;
    let speed = 10;

    if (this.mode === 'walk') {
      this.walkPhase += dt * 9;
      const w = this.walkPhase;
      const sw = Math.sin(w);
      p.pos(this.hips, 0, HIP_STAND + Math.abs(Math.cos(w)) * 0.035, 0).rot(this.hips, 0, 0, 0);
      p.rot(LL.hip, sw * 0.55, 0, 0).rot(LL.knee, Math.max(0, sw) * 0.9, 0, 0);
      p.rot(RL.hip, -sw * 0.55, 0, 0).rot(RL.knee, Math.max(0, -sw) * 0.9, 0, 0);
      p.rot(L.shoulder, -sw * 0.5, 0, -0.12).rot(L.elbow, -0.35, 0, 0);
      p.rot(R.shoulder, sw * 0.5, 0, 0.12).rot(R.elbow, -0.35, 0, 0);
      p.rot(this.chest, 0.06, sw * 0.08, 0).rot(this.head, -0.05, 0, Math.sin(w) * 0.04);
      mouthOpen = 0.5;
      speed = 16;
    } else if (this.mode === 'stand') {
      const breath = Math.sin(time * 2) * 0.02;
      p.pos(this.hips, 0, HIP_STAND, 0).rot(this.hips, 0, 0, 0);
      p.rot(LL.hip, 0, 0, -0.03).rot(LL.knee, 0, 0, 0).rot(RL.hip, 0, 0, 0.03).rot(RL.knee, 0, 0, 0);
      if (this.mood === 'cheer') {
        // "I'm Mr. Meeseeks! Look at me!"
        const bounce = Math.abs(Math.sin(time * 7));
        p.pos(this.hips, 0, HIP_STAND + bounce * 0.07, 0);
        p.rot(L.shoulder, -0.2, 0, -2.5 - Math.sin(time * 9) * 0.25).rot(L.elbow, -0.3, 0, 0);
        p.rot(R.shoulder, -0.2, 0, 2.5 + Math.sin(time * 9 + 1) * 0.25).rot(R.elbow, -0.3, 0, 0);
        p.rot(this.chest, -0.08, 0, 0).rot(this.head, -0.15, 0, Math.sin(time * 5) * 0.08);
        mouthOpen = 1;
        speed = 14;
      } else {
        p.rot(L.shoulder, breath, 0, -0.14).rot(L.elbow, -0.2, 0, 0);
        p.rot(R.shoulder, breath, 0, 0.14).rot(R.elbow, -0.2, 0, 0);
        p.rot(this.chest, breath, 0, 0).rot(this.head, 0, Math.sin(time * 0.7) * 0.3, 0);
      }
    } else {
      // Sitting: thighs forward, shins down.
      p.pos(this.hips, 0, HIP_SIT, 0).rot(this.hips, 0, 0, 0);
      p.rot(LL.hip, -1.5, 0, -0.08).rot(LL.knee, 1.45, 0, 0);
      p.rot(RL.hip, -1.5, 0, 0.08).rot(RL.knee, 1.45, 0, 0);
      this.sitPose(p, time, L, R);
      if (this.mood === 'sleep') { eyeScale = 0.08; mouthOpen = 0.55 + Math.sin(time * 1.4) * 0.35; }
      if (this.mood === 'stress') { eyeScale = 1.15; mouthOpen = 1; speed = 18; }
      if (this.mood === 'wait') mouthOpen = 0.6;
    }

    if (this.talking) mouthOpen = 0.35 + Math.abs(Math.sin(time * 14)) * 0.65;
    p.apply(dt, speed);

    for (const eye of this.eyes) {
      eye.scale.y = THREE.MathUtils.damp(eye.scale.y, eyeScale, 25, dt);
      const pupil = eye.userData.pupil;
      const home = eye.userData.pupilHome;
      const size = this.mood === 'stress' ? 0.6 : 1;
      pupil.scale.set(size, size, size * 0.5);
      pupil.position.x = home.x + (this.mood === 'stress' ? Math.sin(time * 30) * 0.008 : 0);
    }
    this.mouth.scale.y = THREE.MathUtils.damp(this.mouth.scale.y, Math.max(0.15, mouthOpen), 18, dt);
  }

  sitPose(p, time, L, R) {
    const mood = this.mood;
    if (mood === 'work' || mood === 'think') {
      const typeL = Math.sin(time * 17) * 0.06;
      const typeR = Math.sin(time * 17 + 2.1) * 0.06;
      p.rot(this.chest, 0.16, 0, 0);
      p.rot(this.head, 0.12 + Math.sin(time * 3) * 0.02, Math.sin(time * 0.5) * 0.12, 0);
      p.rot(L.shoulder, -0.72 + typeL, 0.22, -0.2).rot(L.elbow, -1.05 + typeL, 0, 0);
      if (mood === 'think') {
        // Hand on chin, head tilted: "hmm, what would Rick do?"
        p.rot(R.shoulder, -1.05, -0.35, 0.1).rot(R.elbow, -2.2, 0, 0);
        p.rot(this.head, 0.02, 0.1, 0.16).rot(this.chest, 0.08, 0, 0);
        p.rot(L.shoulder, -0.72, 0.22, -0.2).rot(L.elbow, -1.05, 0, 0);
      } else {
        p.rot(R.shoulder, -0.72 + typeR, -0.22, 0.2).rot(R.elbow, -1.05 + typeR, 0, 0);
      }
    } else if (mood === 'wait') {
      // Turned towards you, waving to get attention.
      const wave = Math.sin(time * 8);
      p.rot(this.chest, -0.04, 0, 0).rot(this.head, -0.1, 0, Math.sin(time * 2) * 0.1);
      p.rot(R.shoulder, 0, 0, 2.55 + wave * 0.22).rot(R.elbow, -0.25 + wave * 0.2, 0, 0);
      p.rot(L.shoulder, -0.45, 0, -0.2).rot(L.elbow, -0.8, 0, 0);
      p.pos(this.hips, 0, HIP_SIT + Math.abs(Math.sin(time * 4)) * 0.02, 0);
    } else if (mood === 'sleep') {
      // Leaning back, arms dangling, snoring.
      const breath = Math.sin(time * 1.4) * 0.03;
      p.rot(this.chest, -0.3 + breath, 0, 0.05).rot(this.head, -0.35, 0.1, 0.25);
      p.rot(L.shoulder, 0.15, 0, -0.3).rot(L.elbow, -0.1, 0, 0);
      p.rot(R.shoulder, 0.15, 0, 0.3).rot(R.elbow, -0.1, 0, 0);
    } else if (mood === 'stress') {
      // Alternates between frantic typing and clutching its head.
      const panic = Math.sin(time * 0.9) > 0.1;
      const shake = Math.sin(time * 42) * 0.05;
      if (panic) {
        p.rot(this.chest, 0.05 + shake, 0, shake).rot(this.head, -0.1, Math.sin(time * 22) * 0.2, 0);
        p.rot(L.shoulder, -0.6, 0.2, -2.0).rot(L.elbow, -1.9, 0, 0);
        p.rot(R.shoulder, -0.6, -0.2, 2.0).rot(R.elbow, -1.9, 0, 0);
      } else {
        const f = Math.sin(time * 30) * 0.12;
        p.rot(this.chest, 0.28 + shake, 0, 0).rot(this.head, 0.22, 0, shake * 2);
        p.rot(L.shoulder, -0.78 + f, 0.22, -0.2).rot(L.elbow, -1.0 + f, 0, 0);
        p.rot(R.shoulder, -0.78 - f, -0.22, 0.2).rot(R.elbow, -1.0 - f, 0, 0);
      }
    } else {
      p.rot(this.chest, 0.02, 0, 0).rot(this.head, 0, Math.sin(time * 0.6) * 0.4, 0);
      p.rot(L.shoulder, -0.4, 0, -0.18).rot(L.elbow, -0.7, 0, 0);
      p.rot(R.shoulder, -0.4, 0, 0.18).rot(R.elbow, -0.7, 0, 0);
    }
  }
}
