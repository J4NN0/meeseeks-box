import * as THREE from 'three';
import { mesh, toon } from '../engine/toon.js';

// The hand that slaps the Meeseeks: Rick's, the player's. Effects runs the
// slap (what it hits, the sparks, the "SLAP!"); this is the arm and its swing.

// Measured in palm heights: palm towards +x, fingers along +y, thumb towards
// -z, wrist along -y. A right hand coming in from the bottom right of the screen.
let handGeometries;
function handParts() {
  if (handGeometries) return handGeometries;
  const shared = (g) => {
    g.userData.shared = true;
    return g;
  };
  handGeometries = {
    palm: shared(new THREE.SphereGeometry(1, 16, 12)),
    fingers: [0.58, 0.64, 0.58, 0.46].map((len) => shared(new THREE.CapsuleGeometry(0.1, len - 0.2, 4, 8).translate(0, len / 2, 0))),
    thumb: shared(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8).translate(0, 0.25, 0)),
    wrist: shared(new THREE.CylinderGeometry(0.24, 0.26, 0.45, 14)),
    // Shirt cuff peeking out of the lab coat, from the wrist up the arm.
    cuff: shared(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 16).translate(0, 0.12, 0)),
  };
  return handGeometries;
}

/** Never in the way of a click (or the next slap). */
export const unpickable = (m) => {
  m.raycast = () => {};
  return m;
};

function makeHand() {
  const g = handParts();
  const skin = toon('#f6d4ae');
  const hand = new THREE.Group();
  const add = (geometry, x, y, z, rx = 0, rz = 0) => {
    const m = unpickable(mesh(geometry, skin));
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    hand.add(m);
    return m;
  };
  add(g.palm, 0, 0, 0).scale.set(0.17, 0.5, 0.44);
  [-0.3, -0.1, 0.1, 0.29].forEach((z, i) => add(g.fingers[i], 0, 0.36, z, [-0.14, -0.05, 0.05, 0.14][i], -0.06));
  add(g.thumb, 0.03, -0.12, -0.36, -1.0, -0.25);
  add(g.wrist, 0, -0.52, 0);
  return hand;
}

/**
 * The arm, from the wrist back to your shoulder just off the bottom right of
 * the screen: a lab coat sleeve, thicker towards you. Its length is its
 * scale; the cuff is in palm heights.
 */
function makeArm(wristRadius, shoulderRadius) {
  const sleeve = unpickable(mesh(new THREE.CylinderGeometry(shoulderRadius, wristRadius, 1, 18).translate(0, 0.5, 0), toon('#f4f4ef'), { cast: false }));
  const cuff = unpickable(mesh(handParts().cuff, toon('#9fd3e8'), { cast: false }));
  return { sleeve, cuff };
}

// A slap, in seconds: reach in, swing, hold on the cheek, pull back to you.
const WIND = 0.16;
export const HIT = 0.23;
const HOLD = 0.3;
export const END = 0.5;
// Where the hand lands: this far round from the right of the head towards you.
const CHEEK_TURN = 0.7;
// Where the shoulder sits, in screen units (1 is the edge): off the bottom right.
const SHOULDER_WIND = [1.45, -1.45];
const SHOULDER_HIT = [1.3, -1.35];
// Palm heights from the palm's centre down to the end of the wrist.
const WRIST = 0.75;
export const UP = new THREE.Vector3(0, 1, 0);
const _basis = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _shoulder = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _wrist = new THREE.Vector3();
const _arm = new THREE.Vector3();
const _contact = new THREE.Vector3();
const _windUp = new THREE.Vector3();
const easeOut = (k) => 1 - (1 - k) ** 3;
const lerp = THREE.MathUtils.lerp;

/** Hand size goes with the head, but never smaller than a human hand. */
function handSize(radius, scale) {
  return Math.max(0.18 * scale, radius * scale);
}

/**
 * Your arm, reaching in from the bottom right of `camera`'s view to slap a
 * head at `at` (world, `radius` in the head's own `scale`), swinging from the
 * right of the screen (`right`, flat).
 */
export class SlapHand {
  constructor(scene, { camera, at, scale, radius, right }) {
    this.camera = camera;
    this.at = at.clone();
    this.scale = scale;
    this.radius = radius;
    this.right = right.clone();
    // It lands on the cheek nearest you, right of the face and turned your
    // way, so you see the back of your hand hit.
    this.forward = new THREE.Vector3().crossVectors(UP, right);
    this.out = right.clone().multiplyScalar(Math.cos(CHEEK_TURN)).addScaledVector(this.forward, -Math.sin(CHEEK_TURN));
    // The shoulder is nearer the lens for things nearby, and takes up the
    // same bit of the screen corner however far away you are.
    camera.updateMatrixWorld();
    this.depth = THREE.MathUtils.clamp(_v.subVectors(at, camera.position).dot(_camForward.setFromMatrixColumn(camera.matrixWorld, 2).negate()) * 0.3, 0.45, 1.4);
    const size = this.size;
    const shoulderRadius = Math.max(size * 0.36, this.depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.3);
    this.hand = makeHand();
    Object.assign(this, makeArm(size * 0.36, shoulderRadius));
    this.hand.visible = this.sleeve.visible = this.cuff.visible = false;
    scene.add(this.hand, this.sleeve, this.cuff);
  }

  get size() { return handSize(this.radius, this.scale); }

  /** The head's radius in the world. */
  get reach() { return this.radius * this.scale; }

  /** Where the hand is `t` seconds into the slap, for the head where it is now. */
  pose(t) {
    const r = this.reach;
    const size = this.size;

    // Your shoulder, just off screen whichever way you're looking. The
    // camera may have turned since it was last drawn.
    const cam = this.camera;
    cam.updateMatrixWorld();
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    _camRight.setFromMatrixColumn(cam.matrixWorld, 0);
    _camUp.setFromMatrixColumn(cam.matrixWorld, 1);
    _camForward.setFromMatrixColumn(cam.matrixWorld, 2).negate();
    // The shoulder leans in with the swing.
    const lean = t < WIND ? 0 : t < HIT ? (t - WIND) / (HIT - WIND) : t < HOLD ? 1 : 1 - Math.min(1, (t - HOLD) / (END - HOLD));
    const sx = lerp(SHOULDER_WIND[0], SHOULDER_HIT[0], lean);
    const sy = lerp(SHOULDER_WIND[1], SHOULDER_HIT[1], lean);
    _shoulder.copy(cam.position)
      .addScaledVector(_camForward, this.depth)
      .addScaledVector(_camRight, sx * this.depth * tanV * cam.aspect)
      .addScaledVector(_camUp, sy * this.depth * tanV);

    // The palm lands on the near cheek; before that it's cocked back to
    // the right and nearer you.
    _contact.copy(this.at).addScaledVector(this.out, r + size * 0.15);
    _windUp.copy(_contact).addScaledVector(this.right, size * 1.4).addScaledVector(this.forward, -size * 0.7).addScaledVector(UP, size * 0.3);
    // `lift` is how far the fingers bend up from the line of the arm.
    let lift;
    let flat = 1;
    if (t < WIND) {
      _hand.lerpVectors(_shoulder, _windUp, easeOut(t / WIND));
      lift = 1.1;
    } else if (t < HIT) {
      const k = (t - WIND) / (HIT - WIND);
      _hand.lerpVectors(_windUp, _contact, k * k);
      lift = lerp(1.1, 0.6, k);
    } else if (t < HOLD) {
      // Flat against the cheek for a beat.
      _hand.copy(_contact);
      lift = 0.6;
      flat = 0.75;
    } else {
      const k = Math.min(1, (t - HOLD) / (END - HOLD));
      _hand.lerpVectors(_contact, _shoulder, k * k);
      lift = lerp(0.6, 1.0, k);
    }

    // Fingers carry on from the arm, bent up at the wrist; the palm faces
    // the head, so you see the back of your hand.
    _arm.subVectors(_hand, _shoulder).normalize();
    _y.copy(_arm).multiplyScalar(Math.cos(lift)).addScaledVector(UP, Math.sin(lift)).normalize();
    _x.subVectors(this.at, _hand);
    _x.addScaledVector(_y, -_x.dot(_y));
    if (_x.lengthSq() < 1e-8) _x.copy(this.out).negate();
    _x.normalize();
    _z.crossVectors(_x, _y);
    this.hand.position.copy(_hand);
    this.hand.quaternion.setFromRotationMatrix(_basis.makeBasis(_x, _y, _z));
    this.hand.scale.set(size * flat, size, size);

    // The sleeve runs from the wrist back to your shoulder.
    _wrist.copy(_hand).addScaledVector(_y, -WRIST * size);
    _arm.subVectors(_shoulder, _wrist);
    const length = Math.max(1e-3, _arm.length());
    _arm.divideScalar(length);
    this.cuff.position.copy(_wrist);
    this.cuff.quaternion.setFromUnitVectors(UP, _arm);
    this.cuff.scale.setScalar(size);
    this.sleeve.position.copy(_wrist).addScaledVector(_arm, size * 0.2);
    this.sleeve.quaternion.copy(this.cuff.quaternion);
    this.sleeve.scale.set(1, Math.max(1e-3, length - size * 0.2), 1);
    this.hand.visible = this.sleeve.visible = this.cuff.visible = true;
  }

  dispose() {
    this.hand.removeFromParent();
    this.cuff.removeFromParent();
    this.sleeve.removeFromParent();
    this.sleeve.geometry.dispose();
  }
}
