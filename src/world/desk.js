import * as THREE from 'three';
import { box, cyl, glow, mesh, rng, sphere, toon } from '../engine/toon.js';
import { TerminalScreen } from './screens.js';

// One workstation: desk, monitor, keyboard, a swivel chair and some clutter.
// Local frame: the agent sits on +z and faces -z, towards the monitor; the
// camera looks over their shoulder at the screen.

const DESK_H = 0.74;
const CHAIR_Z = 0.66;
const KEYBOARD_Z = 0.14;
const KEY_TOP = DESK_H + 0.054;
const CHAIR_COLORS = ['#2f3640', '#e17055', '#00a8a8', '#6c5ce7', '#fdcb6e', '#2d3436'];
const TOP_COLORS = ['#efe9dc', '#c89560', '#efe9dc', '#d7c29a'];

export class Desk {
  constructor(index, x, z) {
    this.index = index;
    this.agent = null;
    const r = rng(`desk-${index}`);
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    this.root = root;

    // Desk: a top on two T-legs, like every startup's first IKEA run.
    const topColor = TOP_COLORS[Math.floor(r() * TOP_COLORS.length)];
    root.add(box(1.5, 0.05, 0.76, topColor, 0, DESK_H, 0));
    for (const s of [-1, 1]) {
      root.add(box(0.06, DESK_H - 0.03, 0.08, '#3a3f47', s * 0.66, (DESK_H - 0.03) / 2, 0));
      root.add(box(0.07, 0.04, 0.66, '#3a3f47', s * 0.66, 0.02, 0));
    }
    root.add(box(1.26, 0.05, 0.04, '#3a3f47', 0, 0.6, -0.3));

    // Monitor on a stand, screen facing the chair (and the camera behind it).
    const mon = new THREE.Group();
    mon.position.set(0, DESK_H, -0.2);
    root.add(mon);
    mon.add(box(0.3, 0.02, 0.2, '#2b2e33', 0, 0.01, 0));
    mon.add(box(0.05, 0.3, 0.04, '#2b2e33', 0, 0.16, -0.02));
    mon.add(box(1.0, 0.62, 0.05, '#23262b', 0, 0.56, 0));
    this.screen = new TerminalScreen();
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.56), new THREE.MeshBasicMaterial({ map: this.screen.texture, toneMapped: false }));
    screen.position.set(0, 0.56, 0.027);
    mon.add(screen);
    this.monitor = mon;
    this.screenMesh = screen;

    // Keyboard and mouse.
    root.add(box(0.46, 0.022, 0.15, '#3b3f45', 0, DESK_H + 0.035, KEYBOARD_Z));
    root.add(box(0.42, 0.008, 0.11, '#d7dbe0', 0, KEY_TOP - 0.004, KEYBOARD_Z, { cast: false }));
    const mouse = sphere(0.035, '#d7dbe0', 12);
    mouse.scale.set(0.8, 0.45, 1.2);
    mouse.position.set(0.36, DESK_H + 0.035, 0.14);
    root.add(mouse);

    this.addClutter(r);

    // Status beacon: a little lamp that glows the agent's status colour.
    const lampPos = new THREE.Vector3(0.62, DESK_H, -0.26);
    root.add(cyl(0.01, 0.01, 0.34, '#3a3f47', 8).translateX(lampPos.x).translateY(lampPos.y + 0.17).translateZ(lampPos.z));
    this.beaconMat = new THREE.MeshBasicMaterial({ color: '#39424e' });
    const beacon = mesh(new THREE.SphereGeometry(0.055, 16, 12), this.beaconMat);
    beacon.position.set(lampPos.x, lampPos.y + 0.37, lampPos.z);
    root.add(beacon);
    this.beacon = beacon;

    // Swivel chair. The seat anchor is where a sitting agent is parented.
    const chair = new THREE.Group();
    chair.position.set(0, 0, CHAIR_Z);
    root.add(chair);
    const chairColor = CHAIR_COLORS[Math.floor(r() * CHAIR_COLORS.length)];
    for (let i = 0; i < 5; i++) {
      const leg = box(0.3, 0.035, 0.05, '#2b2e33', 0, 0.06, 0);
      leg.geometry.translate(0.15, 0, 0);
      leg.rotation.y = (i / 5) * Math.PI * 2;
      chair.add(leg);
      const wheel = sphere(0.035, '#1f2226', 8);
      wheel.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.29, 0.035, -Math.sin((i / 5) * Math.PI * 2) * 0.29);
      chair.add(wheel);
    }
    chair.add(cyl(0.03, 0.03, 0.34, '#555c66', 10).translateY(0.24));
    const swivel = new THREE.Group();
    swivel.position.y = 0;
    chair.add(swivel);
    swivel.add(box(0.52, 0.08, 0.5, chairColor, 0, 0.43, 0));
    swivel.add(box(0.5, 0.56, 0.07, chairColor, 0, 0.8, 0.25));
    swivel.add(box(0.05, 0.3, 0.05, '#2b2e33', 0, 0.55, 0.27));
    this.swivel = swivel;
    this.seat = new THREE.Group();
    this.seat.rotation.y = Math.PI; // agents face the monitor (-z)
    swivel.add(this.seat);
    this.chair = chair;
    this.swivelTarget = 0;
    this.status = null;
    root.traverse((o) => { if (o.isMesh) o.userData.deskIndex = index; });
  }

  addClutter(r) {
    const root = this.root;
    const y = DESK_H + 0.025;
    const spots = [[-0.6, 0.12], [-0.55, -0.22], [0.52, 0.18]];
    const pick = (list) => list[Math.floor(r() * list.length)];
    for (const [x, z] of spots) {
      const kind = pick(['mug', 'plant', 'duck', 'can', 'none', 'notes', 'pizza', 'mug']);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      if (kind === 'mug') {
        const color = pick(['#e74c3c', '#f5f5f5', '#3498db', '#97ce4c']);
        g.add(cyl(0.045, 0.04, 0.1, color, 14).translateY(0.05));
        const handle = mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), toon(color));
        handle.position.set(0.05, 0.05, 0);
        handle.rotation.y = Math.PI / 2;
        g.add(handle);
        g.add(cyl(0.038, 0.038, 0.005, '#5b3a1e', 14, { cast: false }).translateY(0.09));
      } else if (kind === 'plant') {
        g.add(cyl(0.06, 0.045, 0.1, '#d9825b', 12).translateY(0.05));
        for (let i = 0; i < 5; i++) {
          const leaf = sphere(0.045, i % 2 ? '#5fa35a' : '#4b8d4f', 8);
          leaf.scale.set(0.6, 1.3, 0.6);
          leaf.position.set(Math.cos(i * 1.3) * 0.04, 0.16 + (i % 3) * 0.02, Math.sin(i * 1.3) * 0.04);
          leaf.rotation.z = Math.cos(i * 1.3) * 0.6;
          g.add(leaf);
        }
      } else if (kind === 'duck') {
        // Rubber duck debugging is the original agentic workflow.
        const body = sphere(0.05, '#ffd43b', 12);
        body.scale.set(1.2, 0.85, 1);
        body.position.y = 0.04;
        g.add(body);
        g.add(sphere(0.032, '#ffd43b', 12).translateY(0.1).translateX(0.035));
        const beak = sphere(0.015, '#ff922b', 8);
        beak.scale.set(1.6, 0.6, 1);
        beak.position.set(0.07, 0.095, 0);
        g.add(beak);
        g.rotation.y = r() * Math.PI * 2;
      } else if (kind === 'can') {
        g.add(cyl(0.03, 0.03, 0.12, pick(['#2ecc71', '#e84393', '#0984e3']), 12).translateY(0.06));
      } else if (kind === 'notes') {
        for (let i = 0; i < 3; i++) {
          const n = box(0.08, 0.004, 0.08, pick(['#fff3a8', '#ffc7d9', '#bfe6ff']), (r() - 0.5) * 0.06, 0.003 + i * 0.004, (r() - 0.5) * 0.06, { cast: false });
          n.rotation.y = r();
          g.add(n);
        }
      } else if (kind === 'pizza') {
        g.add(box(0.26, 0.03, 0.26, '#d9b77e', 0, 0.015, 0));
        const slice = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 3), toon('#f7c35f'));
        slice.position.set(0.02, 0.036, 0.0);
        g.add(slice);
        for (let i = 0; i < 3; i++) g.add(cyl(0.012, 0.012, 0.006, '#c0392b', 8, { cast: false }).translateX(-0.01 + i * 0.03).translateY(0.044).translateZ((i - 1) * 0.02));
      }
      root.add(g);
    }
  }

  get free() { return !this.agent; }

  /** Where an arriving agent stands before sitting down (desk-local). */
  get approachLocal() { return new THREE.Vector3(0, 0, CHAIR_Z + 0.55); }

  approachWorld() {
    return this.root.localToWorld(this.approachLocal);
  }

  setStatus(status, color) {
    this.status = status;
    this.beaconMat.color.set(color || '#39424e');
  }

  update(dt, t, now) {
    this.swivel.rotation.y = THREE.MathUtils.damp(this.swivel.rotation.y, this.swivelTarget, 4, dt);
    if (this.status === 'stressed') this.beacon.scale.setScalar(1 + Math.abs(Math.sin(t * 8)) * 0.35);
    else if (this.status === 'waiting') this.beacon.scale.setScalar(1 + Math.abs(Math.sin(t * 3)) * 0.25);
    else this.beacon.scale.setScalar(1);
    if (!this.agent) this.screen.drawIdle(t + this.index * 7);
  }
}

export { DESK_H, CHAIR_Z, KEYBOARD_Z, KEY_TOP };
