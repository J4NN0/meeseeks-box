import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { noInk, ownToon } from '../engine/toon.js';
import { END, HIT, SlapHand, UP, unpickable } from './hand.js';

// Cartoon "poof" clouds. Opaque puffs that pop and shrink, rather than
// transparent smoke, so they get ink outlines like everything else.
// Also runs the slaps (the hand itself is in hand.js) and their "SLAP!".

const puffGeometry = new THREE.IcosahedronGeometry(1, 2);
puffGeometry.userData.shared = true;

const _scale = new THREE.Vector3();
const _end = new THREE.Vector3();

// A cone along +z, its point at the origin and its open end at z = 1.
const beamGeometry = new THREE.ConeGeometry(0.5, 1, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
beamGeometry.userData.shared = true;

// What a slap shouts as it lands, and how many sparks fly off it.
const SLAP_WORDS = ['SLAP!', 'SLAP!', 'SMACK!', 'WHAP!'];
const SLAP_SPARKS = 4;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.puffs = [];
    this.slaps = [];
    this.bursts = [];
    this.material = ownToon('#f4f6f2');
    this.sparkMaterial = new THREE.MeshBasicMaterial({ color: '#fff27a' });
    this.sparkGeometry = new THREE.OctahedronGeometry(0.05, 0);
    this.beams = [];
  }

  /**
   * The battery's shrink ray: a cone of light from `from` (a point) to
   * `to` (an Object3D it follows, or a point), flickering, that fades out
   * after `life` seconds. Its narrow end is at `from`.
   */
  beam(from, to, { life = 1.4, color = '#ff4fd8', width = 0.45 } = {}) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = unpickable(noInk(new THREE.Mesh(beamGeometry, material)));
    mesh.castShadow = false;
    this.scene.add(mesh);
    const beam = { mesh, from: from.clone(), to, life, width, age: 0 };
    this.placeBeam(beam);
    this.beams.push(beam);
    return beam;
  }

  placeBeam(b) {
    const end = b.to.isObject3D ? b.to.getWorldPosition(_end) : _end.copy(b.to);
    const length = Math.max(0.01, b.from.distanceTo(end));
    b.mesh.position.copy(b.from);
    b.mesh.lookAt(end);
    b.mesh.scale.set(b.width, b.width, length);
  }

  updateBeams(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.age += dt;
      const k = b.age / b.life;
      if (k >= 1 || (b.to.isObject3D && !this.holds(b.to))) {
        b.mesh.removeFromParent();
        b.mesh.material.dispose();
        this.beams.splice(i, 1);
        continue;
      }
      this.placeBeam(b);
      // Snaps on, flickers, and fades as it lets go.
      const on = Math.min(1, b.age / 0.08) * (k > 0.75 ? (1 - k) / 0.25 : 1);
      b.mesh.material.opacity = on * (0.42 + Math.sin(b.age * 55) * 0.12);
    }
  }

  /**
   * Your arm reaches in from the bottom right of `camera`'s view and slaps
   * `face` (followed until the hit), swinging from the right of the screen
   * (`right`, flat). Calls `onHit(push)` as it lands, `push` being where it
   * shoves the head. `radius` is the head's, in the face's own scale.
   */
  slap({ camera, face, radius, right, onHit }) {
    const at = face.getWorldPosition(new THREE.Vector3());
    const hand = new SlapHand(this.scene, { camera, at, scale: face.getWorldScale(new THREE.Vector3()).x, radius, right });
    this.slaps.push({ hand, face, onHit, t: 0, hit: false });
  }

  updateSlaps(dt) {
    for (let i = this.slaps.length - 1; i >= 0; i--) {
      const s = this.slaps[i];
      const { hand } = s;
      s.t += dt;
      if (!s.hit) {
        // Its Meeseeks poofed before the hand got there.
        if (!this.holds(s.face)) {
          this.dropSlap(i);
          continue;
        }
        s.face.getWorldPosition(hand.at);
        hand.scale = s.face.getWorldScale(_scale).x;
      }
      hand.pose(s.t);

      if (!s.hit && s.t >= HIT) {
        s.hit = true;
        s.onHit?.(hand.out.clone().negate());
        const r = hand.reach;
        const at = hand.at.clone().addScaledVector(hand.out, r * 1.05);
        this.sparkBurst(at, { scale: hand.size * 2.2, count: SLAP_SPARKS, size: hand.size * 2.4 });
        this.burst(at.addScaledVector(UP, r * 1.1).addScaledVector(hand.right, r * 0.3), SLAP_WORDS[Math.floor(Math.random() * SLAP_WORDS.length)]);
      }
      if (s.t >= END) this.dropSlap(i);
    }
  }

  dropSlap(i) {
    this.slaps[i].hand.dispose();
    this.slaps.splice(i, 1);
  }

  /**
   * Everything still flying, gone at once: for when you leave this universe,
   * which stops updating, so nothing waits half-done (or pops again) for
   * your return.
   */
  clear() {
    while (this.slaps.length) this.dropSlap(this.slaps.length - 1);
    for (const b of this.bursts) b.label.removeFromParent();
    for (const p of this.puffs) p.mesh.removeFromParent();
    for (const b of this.beams) {
      b.mesh.removeFromParent();
      b.mesh.material.dispose();
    }
    this.bursts.length = this.puffs.length = this.beams.length = 0;
  }

  holds(object) {
    let o = object;
    while (o.parent) o = o.parent;
    return o === this.scene;
  }

  /** A comic-book "SLAP!" that pops up and fades. */
  burst(position, word) {
    const el = document.createElement('div');
    el.className = 'slap-burst';
    el.textContent = word;
    el.style.setProperty('--tilt', `${Math.round((Math.random() - 0.5) * 26)}deg`);
    // CSS2DRenderer owns the wrapper's transform; the burst inside animates.
    const wrapper = document.createElement('div');
    wrapper.append(el);
    const label = new CSS2DObject(wrapper);
    label.position.copy(position);
    this.scene.add(label);
    this.bursts.push({ label, age: 0 });
  }

  poof(position, { scale = 1, count = 14 } = {}) {
    const mat = this.material;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(puffGeometry, mat);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const up = 0.3 + Math.random() * 1.3;
      m.position.copy(position).add(new THREE.Vector3(Math.cos(a) * 0.15 * scale, up * 0.6 * scale, Math.sin(a) * 0.15 * scale));
      m.castShadow = false;
      m.scale.setScalar(0.001);
      this.scene.add(m);
      this.puffs.push({
        mesh: m,
        age: -Math.random() * 0.08,
        life: 0.55 + Math.random() * 0.35,
        size: (0.16 + Math.random() * 0.16) * scale,
        vel: new THREE.Vector3(Math.cos(a) * (0.9 + Math.random()), 0.4 + Math.random() * 0.9, Math.sin(a) * (0.9 + Math.random())).multiplyScalar(scale),
      });
    }
    this.sparkBurst(position.clone().add(new THREE.Vector3(0, 0.8 * scale, 0)), { scale });
  }

  /** Yellow sparks flying out; `scale` sets how far, `size` how big. */
  sparkBurst(position, { scale = 1, count = 6, size = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      // Unpickable: they burst where you just clicked.
      const s = unpickable(new THREE.Mesh(this.sparkGeometry, this.sparkMaterial));
      s.position.copy(position);
      s.scale.setScalar(size);
      this.scene.add(s);
      const a = Math.random() * Math.PI * 2;
      this.puffs.push({
        mesh: s,
        age: 0,
        life: 0.7,
        size,
        spark: true,
        vel: new THREE.Vector3(Math.cos(a) * 2.2, 1.5 + Math.random() * 1.5, Math.sin(a) * 2.2).multiplyScalar(scale),
      });
    }
  }

  update(dt) {
    this.updateSlaps(dt);
    this.updateBeams(dt);
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      if (b.age > 0.8) {
        b.label.removeFromParent();
        this.bursts.splice(i, 1);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age < 0) continue;
      const k = p.age / p.life;
      if (k >= 1) {
        p.mesh.removeFromParent();
        this.puffs.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-4 * dt));
      if (p.spark) {
        p.vel.y -= 6 * dt;
        p.mesh.rotation.y += dt * 10;
        p.mesh.scale.setScalar(p.size * (1 - k));
      } else {
        // Quick pop in, slow shrink out.
        const s = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
        p.mesh.scale.setScalar(p.size * (0.4 + 0.6 * Math.sin(Math.min(1, s) * Math.PI * 0.5)) * (k < 0.2 ? 1 : s));
      }
    }
  }
}
