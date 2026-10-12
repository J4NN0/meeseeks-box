import * as THREE from 'three';
import { noInk, toon } from '../engine/toon.js';
import { canvasTexture } from './screens.js';

// Inside the battery, space gives way to the battery itself: the office
// floats in the middle of a huge magenta glass box, and beyond its glass loom the
// giant parts of the engine bay it sits in, one level up (battery.js, at a
// few hundred times the size). Deeper down, the batteries you're nested in
// stand around it like Russian dolls, each bigger and fainter than the last,
// fading into the garage's dark. The garage itself has none of it.

/** The innermost box, in metres, centred on the office: the battery's own proportions (battery.js). */
export const BOX = { w: 76, h: 64, d: 86 };
/** Each battery out is this much bigger than the one inside it. */
const NEST = 1.75;
/** How much bigger the engine bay is than in the car: the box is 0.2 m wide there. */
const SCALE = BOX.h / 0.15;
/** Past this many boxes, they'd be lost in the fog anyway. */
const MAX_BOXES = 4;

const GLASS = '#e53fd9';
const FRAME = '#151316';

/** The panes: glowing at the bottom, a couple of streaks of reflection. */
function glassTexture() {
  const { canvas, ctx, texture } = canvasTexture(256, 256);
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (const [x, w] of [[40, 26], [86, 9], [170, 14]]) {
    ctx.beginPath();
    ctx.moveTo(x, 256);
    ctx.lineTo(x + w, 256);
    ctx.lineTo(x + w + 90, 0);
    ctx.lineTo(x + 90, 0);
    ctx.fill();
  }
  return texture;
}

/** A glowing grid for the floors: the next one down shows through each glass floor. */
function gridTexture(cells) {
  const { ctx, texture } = canvasTexture(512, 512);
  const step = 512 / 8;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  for (let i = 0; i <= 8; i++) {
    ctx.lineWidth = i % 4 === 0 ? 5 : 2;
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, 512);
    ctx.moveTo(0, i * step);
    ctx.lineTo(512, i * step);
    ctx.stroke();
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(cells, cells);
  return texture;
}

/** One battery box around the office, seen from inside: glass all round, dark frame along its edges. */
function batteryBox(size, opacity, map, { solid = false } = {}) {
  const g = new THREE.Group();
  const { w, h, d } = size;
  const glass = new THREE.MeshBasicMaterial({ color: GLASS, map, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const panes = [
    [w, h, [0, 0, -d / 2], 0],
    [w, h, [0, 0, d / 2], Math.PI],
    [d, h, [-w / 2, 0, 0], Math.PI / 2],
    [d, h, [w / 2, 0, 0], -Math.PI / 2],
  ];
  for (const [pw, ph, at, rot] of panes) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), glass);
    pane.position.set(...at);
    pane.rotation.y = rot;
    g.add(pane);
  }
  // Its floor: glass you see the next battery out through, or dark for the
  // outermost, as in the car. Its roof: glass.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), solid
    ? new THREE.MeshBasicMaterial({ color: '#2a1630', transparent: true, opacity: 0.85, depthWrite: false })
    : new THREE.MeshBasicMaterial({ color: GLASS, transparent: true, opacity: opacity * 0.55, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -h / 2;
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: GLASS, map: gridTexture(w / 32), transparent: true, opacity: Math.min(1, opacity * 1.2), depthWrite: false, blending: THREE.AdditiveBlending }));
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -h / 2 + 0.05;
  g.add(grid);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: GLASS, transparent: true, opacity: opacity * 0.5, depthWrite: false, side: THREE.DoubleSide }));
  roof.rotation.x = Math.PI / 2;
  roof.position.y = h / 2;
  g.add(floor, roof);

  const t = w * 0.016;
  const frame = new THREE.MeshBasicMaterial({ color: FRAME, transparent: opacity < 0.2, opacity: Math.min(1, opacity * 5) });
  const beam = (bw, bh, bd, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), frame);
    m.position.set(x, y, z);
    g.add(m);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(t, h, t, (sx * w) / 2, 0, (sz * d) / 2);
  for (const y of [-h / 2, h / 2]) {
    for (const sz of [-1, 1]) beam(w + t, t, t, 0, y, (sz * d) / 2);
    for (const sx of [-1, 1]) beam(t, t, d + t, (sx * w) / 2, y, 0);
  }
  return g;
}

/**
 * The rest of the engine bay one level up, as in battery.js but huge: the
 * green globe, the orange canister, the blue dome, and the remote on its
 * cord, around a floor that fades out.
 */
function engineBay() {
  const g = new THREE.Group();
  // Offsets from the box's middle, in the car's engine bay, scaled up; the
  // bay's floor is level with the box's.
  const at = (x, y, z) => new THREE.Vector3(x * SCALE, y * SCALE, z * SCALE);

  const floorTex = canvasTexture(256, 256);
  const fg = floorTex.ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  fg.addColorStop(0, 'rgba(36,39,44,1)');
  fg.addColorStop(0.75, 'rgba(36,39,44,0.9)');
  fg.addColorStop(1, 'rgba(36,39,44,0)');
  floorTex.ctx.fillStyle = fg;
  floorTex.ctx.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(BOX.w * 2.2, 48), new THREE.MeshBasicMaterial({ map: floorTex.texture, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -BOX.h / 2 - 0.5;
  g.add(floor);

  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.085 * SCALE, 32, 20), toon('#9bd84f'));
  globe.position.copy(at(0.05, 0, -0.32));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08 * SCALE, 0.01 * SCALE, 10, 40), toon('#4f7d32'));
  ring.position.copy(globe.position);
  ring.rotation.y = Math.PI / 2 + 0.3;
  const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.032 * SCALE, 0.032 * SCALE, 0.12 * SCALE, 24), toon('#f2a33a'));
  canister.position.copy(at(-0.2, -0.025, -0.2));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07 * SCALE, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), toon('#6ec6ee'));
  dome.position.copy(at(-0.3, -0.085, -0.5));
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * SCALE, 0.075 * SCALE, 0.03 * SCALE, 28), toon('#4f7d32'));
  domeBase.position.copy(dome.position);

  const remote = new THREE.Group();
  remote.position.copy(at(0.3, -0.067, -0.12));
  remote.rotation.y = 0.5;
  remote.add(new THREE.Mesh(new THREE.BoxGeometry(0.1 * SCALE, 0.035 * SCALE, 0.06 * SCALE), toon('#4a4f57')));
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.013 * SCALE, 0.013 * SCALE, 0.012 * SCALE, 20), new THREE.MeshBasicMaterial({ color: '#e74c3c' }));
  button.position.y = 0.022 * SCALE;
  remote.add(button);
  const cord = new THREE.CatmullRomCurve3([
    at(0.27, -0.06, -0.09),
    at(0.25, -0.02, -0.02),
    at(0.17, 0.0, 0.05),
    at(0.1, -0.05, 0.04),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(cord, 24, 0.006 * SCALE, 8), toon('#5a3a2e')));
  g.add(globe, ring, canister, dome, domeBase, remote);
  return g;
}

/** `level` is how deep the office is, from 1: the garage has no backdrop. */
export function createBackdrop(level) {
  const group = new THREE.Group();
  const map = glassTexture();
  // One battery per level up, each bigger and fainter than the one inside
  // it; only the outermost has a solid floor.
  const count = Math.min(level, MAX_BOXES);
  for (let i = 0; i < count; i++) {
    const k = NEST ** i;
    group.add(batteryBox({ w: BOX.w * k, h: BOX.h * k, d: BOX.d * k }, 0.42 / (1 + i * 0.5), map, { solid: i === count - 1 }));
  }
  group.add(engineBay());
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });
  noInk(group);
  return group;
}

/** How far you can see in there: the backdrop's fog starts past the office. */
export const BACKDROP_FOG = { near: 90, far: 1600 };
