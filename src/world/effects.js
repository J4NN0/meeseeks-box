import * as THREE from 'three';
import { ownToon } from '../engine/toon.js';

// Cartoon "poof" clouds. Opaque puffs that pop and shrink, rather than
// transparent smoke, so they get ink outlines like everything else.

const puffGeometry = new THREE.IcosahedronGeometry(1, 2);
puffGeometry.userData.shared = true;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.puffs = [];
    this.material = ownToon('#f4f6f2');
    this.sparkMaterial = new THREE.MeshBasicMaterial({ color: '#fff27a' });
    this.sparkGeometry = new THREE.OctahedronGeometry(0.05, 0);
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
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(this.sparkGeometry, this.sparkMaterial);
      s.position.copy(position).add(new THREE.Vector3(0, 0.8 * scale, 0));
      this.scene.add(s);
      const a = Math.random() * Math.PI * 2;
      this.puffs.push({
        mesh: s,
        age: 0,
        life: 0.7,
        size: 1,
        spark: true,
        vel: new THREE.Vector3(Math.cos(a) * 2.2, 1.5 + Math.random() * 1.5, Math.sin(a) * 2.2).multiplyScalar(scale),
      });
    }
  }

  update(dt) {
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
        p.mesh.scale.setScalar(1 - k);
      } else {
        // Quick pop in, slow shrink out.
        const s = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
        p.mesh.scale.setScalar(p.size * (0.4 + 0.6 * Math.sin(Math.min(1, s) * Math.PI * 0.5)) * (k < 0.2 ? 1 : s));
      }
    }
  }
}
