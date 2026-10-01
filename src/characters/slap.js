import * as THREE from 'three';

// What a mascot needs to take a slap: the springs its joints wobble on, the
// dizzy stars and the handprint. The reaction itself is in CharacterBase
// (rig.js); the hand that does the slapping is in world/hand.js.

/** How long each part of the reaction lasts, in seconds since the hit. */
export const SLAP = { flinch: 0.3, daze: 2.2, mark: 4 };

// However fast you slap, a spring never swings further than this many hits' worth.
const MAX_STACK = 1.6;

const _a = new THREE.Vector3();

/** A damped spring on a joint's offset rotation: kick it and it wobbles back. */
export class Wobble {
  constructor(freq, damping) {
    this.k = freq * freq;
    this.c = 2 * damping * freq;
    // Kick speed per radian of first swing, so kicks are sized by how far they throw.
    const wd = freq * Math.sqrt(1 - damping * damping);
    const phi = Math.atan2(wd, damping * freq);
    this.gain = wd / (Math.sin(phi) * Math.exp((-damping * freq * phi) / wd));
    this.x = new THREE.Vector3();
    this.v = new THREE.Vector3();
  }

  /** `swing` is the rotation (axis times angle) at the first peak. */
  kick(swing) {
    this.v.addScaledVector(swing, this.gain);
    // Trim the speed so the swing (where it is, plus how far its speed would
    // carry it, damping aside) stays in bounds; trimming where it is would
    // make it jump.
    const reach = swing.length() * MAX_STACK;
    const room = this.k * (reach * reach - this.x.lengthSq());
    if (this.v.lengthSq() > room) this.v.setLength(Math.sqrt(Math.max(0, room)));
  }

  get resting() {
    return this.x.lengthSq() < 1e-7 && this.v.lengthSq() < 1e-6;
  }

  step(dt) {
    const n = Math.ceil(dt * 240);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      _a.copy(this.x).multiplyScalar(-this.k).addScaledVector(this.v, -this.c);
      this.v.addScaledVector(_a, h);
      this.x.addScaledVector(this.v, h);
    }
  }
}

/** Dizzy stars: a five-pointed star, one unit across its points. */
export const starGeometry = (() => {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.42 : 1;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
  g.translate(0, 0, -0.175);
  g.userData.shared = true;
  return g;
})();

/**
 * A red handprint for the cheek, fingers up. Drawn the first time a mascot
 * asks for one, then shared by every mascot with cheeks to print it on; each
 * one fades its own copy of the material.
 */
let handprint;
function handprintTexture() {
  if (handprint) return handprint;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#e8414f';
  g.shadowColor = '#e8414f';
  g.shadowBlur = 4;
  const blob = (x, y, rx, ry, a = 0) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
    g.fill();
  };
  blob(62, 84, 25, 28);
  [[-0.38, 34], [-0.13, 40], [0.12, 38], [0.36, 30]].forEach(([a, len], i) => {
    const bx = 48 + i * 9.5;
    blob(bx + Math.sin(a) * len * 0.55, 66 - Math.cos(a) * len * 0.55, 6.5, len * 0.62, a);
  });
  blob(94, 88, 7, 19, 0.9);
  handprint = new THREE.CanvasTexture(canvas);
  handprint.colorSpace = THREE.SRGBColorSpace;
  handprint.userData.shared = true;
  return handprint;
}

/** Material for a cheek's handprint, hidden until a slap shows it. */
export function markMaterial() {
  return new THREE.MeshBasicMaterial({ map: handprintTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}
