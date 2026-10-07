import * as THREE from 'three';
import { mesh, noInk, ownToon, rng } from '../engine/toon.js';
import { CharacterBase, PEN_DIR, heldPen, joint, limb, pointing, solveArm } from './rig.js';
import { markMaterial } from './slap.js';
import { CHAIR_Z, KEYBOARD_Z, KEY_TOP } from '../world/desk.js';

// Mr. Meeseeks: tall, lanky, big round head, one tuft of hair.
// Local space: feet on y = 0, facing +z.

const HIP_STAND = 0.82;
const HIP_SIT = 0.47;
const CHEST_Y = 0.02;
const SHOULDER = { x: 0.15, y: 0.43 };
const UPPER_ARM = 0.31;
const FOREARM = 0.29;

// The palms go just short of the keyboard centre, KEYS_Z in front of the
// seat, with their centres PALM above the key tops.
const KEYS_Z = CHAIR_Z - KEYBOARD_Z - 0.01;
const PALM = 0.031;
// Too short for the desk to keep its elbows down, so they stick out sideways.
const ELBOW_POLE = new THREE.Vector3(0.9, -0.2, -0.3);

// Where a slap's handprint lands on the skull, in its sphere's angles.
const CHEEK = { phi: 0.61, theta: 1.75, size: 0.78 };

const X_AXIS = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
// At a meeting table: how far the pen's tip is past the hand holding it,
// and the mug's middle once it's up at the mouth.
const PEN = 0.11;
const MOUTH_CUP = new THREE.Vector3(0.02, 1.14, 0.3);
const WRITE_POLE = new THREE.Vector3(0.7, -0.5, -0.4);
const CUP_POLE = new THREE.Vector3(0.9, -0.6, 0.1);
const REST_POLE = new THREE.Vector3(0.8, -0.5, -0.3);
// Standing at the coffee bar: the middle of what's in its cup hand, carried
// in front of it or up at its mouth. Reaching over the counter, its elbow
// points out and down, and it leans in for what's further away.
const CARRY = new THREE.Vector3(0.09, 1.13, 0.26);
const MOUTH_STAND = new THREE.Vector3(MOUTH_CUP.x, MOUTH_CUP.y + HIP_STAND - HIP_SIT, MOUTH_CUP.z);
const GRAB_POLE = new THREE.Vector3(0.8, -0.6, -0.2);
const LEAN = { from: 0.35, per: 0.75, max: 0.62 };
const _target = new THREE.Vector3();
const _upper = new THREE.Vector3();
const _roll = new THREE.Quaternion();
const _reach = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _back = new THREE.Vector3();
const _side = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qArm = new THREE.Quaternion();
const _qJoint = new THREE.Quaternion();
const _basis = new THREE.Matrix4();
const _euler = new THREE.Euler();
const ACCESSORIES = ['none', 'headphones', 'beanie', 'cap', 'glasses', 'none', 'headphones', 'tie'];

/**
 * How a hand turns about its forearm: not at all with the arm down, half a
 * turn once it's up overhead, so the palm faces front and the thumb points
 * at the head instead of drooping off the outside.
 */
function palmRoll({ shoulder, s }) {
  const up = _upper.set(0, -1, 0).applyQuaternion(shoulder.quaternion).y;
  return _roll.setFromAxisAngle(UP, s * Math.PI * THREE.MathUtils.smoothstep(up, 0.3, 0.6));
}

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
    // Slaps knock the upper body about on `jolt`, the head on `headJolt`.
    this.jolt = joint(hips, 0, CHEST_Y, 0);
    const chest = joint(this.jolt);
    this.chest = chest;
    const profile = [
      [0, 0], [0.12, 0.01], [0.135, 0.08], [0.13, 0.2], [0.145, 0.33], [0.155, 0.42], [0.135, 0.5], [0.1, 0.56], [0, 0.6],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const torso = mesh(new THREE.LatheGeometry(profile, 24), skin);
    torso.scale.z = 0.82;
    chest.add(torso);

    // Head -----------------------------------------------------------------
    this.headJolt = joint(chest, 0, 0.5, 0);
    const head = joint(this.headJolt);
    this.head = head;
    const skull = mesh(new THREE.SphereGeometry(0.25, 32, 24), skin);
    skull.scale.set(1, 1.12, 0.92);
    skull.position.y = 0.25;
    head.add(skull);
    this.face = joint(head, 0, 0.26, 0);
    this.faceRadius = 0.25;
    this.crown = joint(head, 0, 0.64, 0);
    this.crownRadius = 0.2;

    // Handprints for after a slap: patches of the skull's own surface, so
    // they hug the cheek.
    this.marks = [-1, 1].map((s) => {
      const phi = s < 0 ? CHEEK.phi : Math.PI - CHEEK.phi;
      const g = new THREE.SphereGeometry(0.25 * 1.012, 10, 10, phi - CHEEK.size / 2, CHEEK.size, CHEEK.theta - CHEEK.size / 2, CHEEK.size);
      // Mirror images: both thumbs towards the nose.
      if (s > 0) {
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
      }
      const mark = noInk(mesh(g, this.track(markMaterial()), { cast: false, receive: false }));
      mark.scale.copy(skull.scale);
      mark.position.y = skull.position.y;
      mark.visible = false;
      head.add(mark);
      return mark;
    });

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
      const shoulder = joint(chest, s * SHOULDER.x, SHOULDER.y, 0);
      shoulder.add(limb(UPPER_ARM, 0.034, skin));
      const elbow = joint(shoulder, 0, -UPPER_ARM, 0);
      elbow.add(limb(FOREARM - 0.01, 0.031, skin)); // stops short of the wrist
      const hand = joint(elbow, 0, -FOREARM, 0);
      const palm = mesh(new THREE.SphereGeometry(0.052, 14, 10), skin);
      palm.scale.set(0.85, 1.15, 0.6);
      hand.add(palm);
      const thumb = limb(0.06, 0.016, skin, 6);
      const thumbJoint = joint(hand, -s * 0.035, 0.01, 0);
      thumbJoint.rotation.z = -s * 0.7;
      thumbJoint.add(thumb);
      return { shoulder, elbow, hand, s };
    });
    // It writes with its -x hand and drinks with its +x one, the mug's
    // handle in its fingers.
    this.pen = heldPen(this.track(ownToon('#2f5fbf')), black, PEN);
    this.arms[0].hand.add(this.pen);
    this.cupHand = this.arms[1].hand;
    this.cupOffset.set(-0.07, 0, 0);

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
    this.updateSlap(dt);
    const blinking = this.updateBlink(dt);
    let eyeScale = blinking ? 0.1 : 1;
    let mouthOpen = 0.35;
    let speed = 10;
    // Hands follow the forearm unless the pose (typing, writing) says otherwise.
    for (const arm of this.arms) p.turn(arm.hand, palmRoll(arm));

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
      // Carrying its coffee, it keeps that hand still.
      if (this.carrying) this.reach(p, R, _reach.copy(CARRY).sub(this.cupOffset), 0.06, CUP_POLE, HIP_STAND);
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
      } else if (this.grab || this.carrying) {
        this.handsPose(p, time, L, R, breath);
      } else {
        p.rot(L.shoulder, breath, 0, -0.14).rot(L.elbow, -0.2, 0, 0);
        p.rot(R.shoulder, breath, 0, 0.14).rot(R.elbow, -0.2, 0, 0);
        p.rot(this.chest, breath, 0, 0).rot(this.head, 0, Math.sin(time * 0.7) * 0.3, 0);
        this.freeHand(p, time, L, breath);
      }
    } else {
      // Sitting: thighs forward, shins down.
      p.pos(this.hips, 0, HIP_SIT, 0).rot(this.hips, 0, 0, 0);
      p.rot(LL.hip, -1.5, 0, -0.08).rot(LL.knee, 1.45, 0, 0);
      p.rot(RL.hip, -1.5, 0, 0.08).rot(RL.knee, 1.45, 0, 0);
      this.sitPose(p, dt, time, L, R);
      if (this.mood === 'sleep') { eyeScale = 0.08; mouthOpen = 0.55 + Math.sin(time * 1.4) * 0.35; }
      if (this.mood === 'stress') { eyeScale = 1.15; mouthOpen = 1; speed = 18; }
      if (this.mood === 'wait') mouthOpen = 0.6;
    }

    if (this.talking) mouthOpen = 0.35 + Math.abs(Math.sin(time * 14)) * 0.65;
    if (this.chew) mouthOpen = 0.15 + Math.abs(Math.sin(time * 11)) * 0.75;
    // Slapped: eyes screwed shut and an "O" of a mouth, then wide-eyed and
    // seeing stars (even if it was napping).
    if (this.flinching) {
      eyeScale = 0.1;
      mouthOpen = 1;
    } else if (this.dazed) {
      eyeScale = 1.2;
      mouthOpen = Math.max(mouthOpen, 0.6);
    }
    p.apply(dt, speed);

    const dizzy = this.dazed;
    this.eyes.forEach((eye, i) => {
      eye.scale.y = THREE.MathUtils.damp(eye.scale.y, eyeScale, 25, dt);
      const pupil = eye.userData.pupil;
      const home = eye.userData.pupilHome;
      const size = this.mood === 'stress' && !dizzy ? 0.6 : 1;
      pupil.scale.set(size, size, size * 0.5);
      // Dizzy pupils roll round in opposite directions.
      const roll = time * 11 + i * Math.PI;
      pupil.position.x = home.x + (dizzy ? Math.cos(roll) * 0.016 : this.mood === 'stress' ? Math.sin(time * 30) * 0.008 : 0);
      pupil.position.y = home.y + (dizzy ? Math.sin(roll) * 0.016 : 0);
    });
    this.mouth.scale.y = THREE.MathUtils.damp(this.mouth.scale.y, Math.max(0.15, mouthOpen), 18, dt);
  }

  sitPose(p, dt, time, L, R) {
    const mood = this.mood;
    if (this.table && (mood === 'work' || mood === 'think' || mood === 'sip')) {
      this.tablePose(p, dt, time, L, R);
      return;
    }
    if (this.table && mood === 'stress' && Math.sin(time * 0.9) <= 0.1) {
      // Between bouts of panic, scribbling like mad.
      const shake = Math.sin(time * 42) * 0.05;
      p.rot(this.chest, 0.26, 0, shake).rot(this.head, 0.3, 0, shake * 2);
      this.writePose(p, dt, time, L, { lean: 0.26, rate: 2.6 });
      this.restPose(p, R, 0.26);
      return;
    }
    if (mood === 'work' || mood === 'think') {
      p.rot(this.chest, 0.16, 0, 0);
      p.rot(this.head, 0.12 + Math.sin(time * 3) * 0.02, Math.sin(time * 0.5) * 0.12, 0);
      if (mood === 'think') {
        // Hand on chin, head tilted: "hmm, what would Rick do?"
        p.rot(R.shoulder, -1.05, -0.35, 0.1).rot(R.elbow, -2.2, 0, 0);
        p.rot(this.head, 0.02, 0.1, 0.16).rot(this.chest, 0.08, 0, 0);
        this.typePose(p, time, [L], { lean: 0.08, rate: 17, lift: 0 });
      } else {
        this.typePose(p, time, [L, R], { lean: 0.16, rate: 17, lift: 0.02 });
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
        p.rot(this.chest, 0.28, 0, 0).rot(this.head, 0.22, 0, shake * 2);
        this.typePose(p, time, [L, R], { lean: 0.28, rate: 30, lift: 0.045 });
      }
    } else {
      p.rot(this.chest, 0.02, 0, 0).rot(this.head, 0, Math.sin(time * 0.6) * 0.4, 0);
      p.rot(L.shoulder, -0.4, 0, -0.18).rot(L.elbow, -0.7, 0, 0);
      p.rot(R.shoulder, -0.4, 0, 0.18).rot(R.elbow, -0.7, 0, 0);
    }
  }

  /**
   * At a meeting table: taking notes, hand on chin if it's thinking, and
   * every so often (`sip` mood) a drink of coffee.
   */
  tablePose(p, dt, time, L, R) {
    const { mood } = this;
    const sip = mood === 'sip' ? this.sip : 0;
    const lean = 0.14 - sip * 0.12;
    p.rot(this.chest, lean, 0, 0);
    if (mood === 'sip') {
      // Eyes on the mug as it comes up, head back to drink.
      p.rot(this.head, 0.22 - sip * 0.42, 0.18 * (1 - sip), 0);
      this.writePose(p, dt, time, L, { lean, rate: 0 });
      const { cup } = this.table;
      // The hand goes to the handle, on the mug's +x side.
      _reach.set(cup.x - this.cupOffset.x, cup.y, cup.z).lerp(_target.copy(MOUTH_CUP).sub(this.cupOffset), sip);
      this.reach(p, R, _reach, lean, CUP_POLE);
    } else if (mood === 'think') {
      // "Hmm, what would Rick do?", tapping the pen on the pad.
      p.rot(R.shoulder, -1.05, -0.35, 0.1).rot(R.elbow, -2.2, 0, 0);
      p.rot(this.head, 0.06, 0.1, 0.16);
      this.writePose(p, dt, time, L, { lean, tap: true });
    } else {
      p.rot(this.head, 0.34 + Math.sin(time * 3) * 0.02, Math.sin(time * 0.5) * 0.08, 0);
      this.writePose(p, dt, time, L, { lean, rate: 1 });
      this.restPose(p, R, lean);
    }
  }

  /**
   * Writing on the pad: the pen's tip on the paper where penTip says, the
   * hand turned so the pen points down at it, the arm reaching the hand.
   */
  writePose(p, dt, time, arm, { lean, ...how }) {
    this.penAt(dt, time, how, _tip);
    const sol = this.reach(p, arm, _reach.copy(_tip).addScaledVector(PEN_DIR, -PEN), lean, WRITE_POLE);
    _qArm.setFromAxisAngle(X_AXIS, lean)
      .multiply(_qJoint.setFromEuler(_euler.set(sol.x, sol.y, sol.z)))
      .multiply(_qJoint.setFromAxisAngle(X_AXIS, sol.bend));
    p.turn(arm.hand, pointing(_qArm, PEN_DIR));
  }

  /** The other hand resting on the table, by the mug. */
  restPose(p, arm, lean) {
    const { cup, pad } = this.table;
    this.reach(p, arm, _reach.set(cup.x - 0.1, pad.y + 0.03, cup.z - 0.08), lean, REST_POLE);
  }

  /**
   * On its feet at the coffee bar, its cup hand busy: reaching over the
   * counter (`grab`), leaning in if it's far, eyes on it; or holding a mug or
   * a fruit in front of it, up at its mouth as `sip` goes to 1, head back.
   */
  handsPose(p, time, L, R, breath) {
    let lean = 0;
    let nod;
    if (this.grab) {
      lean = THREE.MathUtils.clamp((this.grab.z - LEAN.from) / LEAN.per, 0, LEAN.max);
      nod = 0.4;
      this.reach(p, R, this.grab, lean, GRAB_POLE, HIP_STAND);
    } else {
      _reach.copy(CARRY).lerp(MOUTH_STAND, this.sip).sub(this.cupOffset);
      nod = 0.18 - this.sip * 0.4;
      this.reach(p, R, _reach, 0, CUP_POLE, HIP_STAND);
    }
    p.rot(this.chest, lean + breath, 0, 0).rot(this.head, nod, Math.sin(time * 0.7) * 0.12 * (1 - this.sip), 0);
    this.freeHand(p, time, L, breath);
  }

  /** Its other hand, at the coffee bar: down by its side, or talking along with it (`gesture`). */
  freeHand(p, time, L, breath) {
    if (!this.gesture) return;
    if (this.talking) {
      const g = Math.sin(time * 5.5);
      p.rot(L.shoulder, -0.7 + g * 0.2, 0.25, -0.32 - g * 0.08).rot(L.elbow, -1.25 + Math.sin(time * 8.5) * 0.3, 0, 0);
    } else {
      p.rot(L.shoulder, breath, 0, -0.14).rot(L.elbow, -0.2, 0, 0);
    }
  }

  /**
   * Puts `arm`'s hand at `target` (in its own frame), the elbow towards
   * `pole`, with the chest leaning by `lean`: sitting, or with its hips at
   * `hipY` standing.
   */
  reach(p, { shoulder, elbow, s }, target, lean, pole, hipY = HIP_SIT) {
    _target.set(target.x, target.y - hipY - CHEST_Y, target.z).applyAxisAngle(X_AXIS, -lean);
    _target.x -= s * SHOULDER.x;
    _target.y -= SHOULDER.y;
    _pole.set(s * pole.x, pole.y, pole.z);
    const arm = solveArm(_target, _pole, UPPER_ARM, FOREARM);
    p.rot(shoulder, arm.x, arm.y, arm.z).rot(elbow, arm.bend, 0, 0);
    return arm;
  }

  /**
   * Palms flat on the keyboard, tapping away. Solved with IK against the
   * desk's keyboard so the hands land on the keys whatever the lean.
   */
  typePose(p, time, arms, { lean, rate, lift }) {
    for (const { shoulder, elbow, hand, s } of arms) {
      const phase = s > 0 ? 2.1 : 0;
      const tap = Math.max(0, Math.sin(time * rate + phase)) ** 2 * lift;
      // Where the palm goes, in the leaning chest's frame, relative to the shoulder.
      _target.set(
        s * 0.1 + Math.sin(time * 1.3 + phase) * 0.015,
        KEY_TOP + PALM + tap - HIP_SIT - CHEST_Y,
        KEYS_Z + Math.sin(time * 0.9 + phase) * 0.012,
      ).applyAxisAngle(X_AXIS, -lean);
      _target.x -= s * SHOULDER.x;
      _target.y -= SHOULDER.y;
      _pole.set(s * ELBOW_POLE.x, ELBOW_POLE.y, ELBOW_POLE.z);
      const arm = solveArm(_target, _pole, UPPER_ARM, FOREARM);
      p.rot(shoulder, arm.x, arm.y, arm.z).rot(elbow, arm.bend, 0, 0);

      // Palm flat with the back of the hand up, fingers pointing at the keys
      // and turned in a little, whatever angle the forearm arrives at.
      _back.set(s * 0.3, 0, -1).normalize();
      _side.crossVectors(_back, UP);
      _q.setFromRotationMatrix(_basis.makeBasis(_side, _back, UP));
      _qArm.setFromAxisAngle(X_AXIS, lean)
        .multiply(_qJoint.setFromEuler(_euler.set(arm.x, arm.y, arm.z)))
        .multiply(_qJoint.setFromAxisAngle(X_AXIS, arm.bend));
      p.turn(hand, _q.premultiply(_qArm.invert()));
    }
  }
}
