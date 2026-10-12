import * as THREE from 'three';
import { box, cyl, mesh, ownToon, sphere, toon } from '../../engine/toon.js';
import { canvasTexture } from '../screens.js';
import { roundedRect } from '../props/shapes.js';
import { DESK_H } from '../desk.js';

// The meeting room's furniture: the long table, a notepad and a mug of
// coffee at every place, the airpot and the spare mugs in the middle, the
// bell that calls the meeting. Floor
// pieces have their origin on the floor in the middle and face +z;
// table-top ones sit on y = 0.

/** As high as a desk, so sitting at it is just like sitting at one. */
export const TABLE = { length: 3.6, width: 1.3, top: DESK_H + 0.025 };

const WOOD = '#7a4f33';
const WOOD_EDGE = '#5e3b25';
const METAL = '#3a3f47';

export function createTable() {
  const g = new THREE.Group();
  const { length: L, width: W, top } = TABLE;
  const slab = new THREE.ExtrudeGeometry(roundedRect(L, W, 0.18), { depth: 0.05, bevelEnabled: false, curveSegments: 10 });
  slab.rotateX(-Math.PI / 2);
  const board = mesh(slab, toon(WOOD));
  board.position.y = top - 0.05;
  g.add(board);
  const lip = new THREE.ExtrudeGeometry(roundedRect(L - 0.06, W - 0.06, 0.15), { depth: 0.03, bevelEnabled: false, curveSegments: 10 });
  lip.rotateX(-Math.PI / 2);
  const under = mesh(lip, toon(WOOD_EDGE), { cast: false });
  under.position.y = top - 0.08;
  g.add(under);
  // Two pedestals, well in from the edges so knees fit under.
  for (const s of [-1, 1]) {
    const x = s * L * 0.28;
    g.add(box(0.16, top - 0.12, 0.42, METAL, x, (top - 0.12) / 2 + 0.04, 0));
    g.add(box(0.5, 0.04, 0.86, METAL, x, 0.02, 0));
  }
  g.add(box(L * 0.56, 0.06, 0.08, METAL, 0, 0.32, 0));
  return g;
}

/**
 * Where things are at a place, in the frame of whoever sits there (facing
 * +z, the table's edge 0.28 ahead, as at a desk): the middle of its notepad
 * and of its mug, which it drinks from with its +x hand.
 */
export const SETTING = {
  pad: new THREE.Vector3(-0.07, TABLE.top + 0.012, 0.5),
  cup: new THREE.Vector3(0.27, TABLE.top + 0.05, 0.4),
};

const MUG = { r: 0.04, h: 0.1 };

/** A yellow legal pad, its binding at the far end; `paper` is from padPaper(). */
export function createNotepad(paper) {
  const g = new THREE.Group();
  const sheets = mesh(new THREE.BoxGeometry(0.17, 0.012, 0.23), paper, { cast: false });
  sheets.position.y = 0.006;
  g.add(sheets);
  g.add(box(0.172, 0.016, 0.03, '#8e2b2b', 0, 0.008, -0.105, { cast: false }));
  return g;
}

/** The pads' paper, ruled with a red margin on top: one texture for every pad in the room. */
export function padPaper() {
  const { canvas, ctx, texture } = canvasTexture(64, 96);
  ctx.fillStyle = '#f7e27a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(70, 110, 170, 0.55)';
  ctx.lineWidth = 2;
  for (let y = 16; y < canvas.height; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200, 60, 60, 0.7)';
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(12, canvas.height);
  ctx.stroke();
  texture.needsUpdate = true;
  // Only the top face is ruled.
  const plain = toon('#f7e27a');
  const ruled = ownToon('#ffffff', { map: texture });
  return [plain, plain, ruled, plain, plain, plain];
}

/** A mug of coffee, its handle on +x. */
export function createMug(color) {
  const g = new THREE.Group();
  g.add(cyl(MUG.r, MUG.r * 0.9, MUG.h, color, 16).translateY(MUG.h / 2));
  g.add(cyl(MUG.r * 0.86, MUG.r * 0.86, 0.004, '#4a2b17', 16, { cast: false }).translateY(MUG.h - 0.012));
  const handle = mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 14, Math.PI), toon(color));
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(MUG.r, MUG.h / 2, 0);
  g.add(handle);
  return g;
}

/**
 * The coffee for the meeting: a pump-action airpot, the kind you carry by
 * its big handle, and a tray of clean mugs upside down beside it.
 */
export function createCoffee() {
  const g = new THREE.Group();
  const steel = toon('#c9ced6');
  const body = new THREE.LatheGeometry(
    [[0, 0], [0.078, 0], [0.084, 0.03], [0.084, 0.2], [0.072, 0.25], [0, 0.25]].map(([x, y]) => new THREE.Vector2(x, y)),
    24,
  );
  g.add(mesh(body, toon('#2b2e33')));
  g.add(cyl(0.086, 0.086, 0.03, steel, 24).translateY(0.05));
  g.add(cyl(0.06, 0.07, 0.04, steel, 20).translateY(0.27));
  // The pump on top, and the spout at the front.
  g.add(box(0.07, 0.02, 0.1, '#c0392b', 0, 0.3, 0.01));
  const spout = cyl(0.014, 0.018, 0.09, steel, 10);
  spout.rotation.x = Math.PI / 2 - 0.5;
  spout.position.set(0, 0.255, 0.1);
  g.add(spout);
  // The handle: a loop round the back to carry it by.
  const handle = mesh(new THREE.TorusGeometry(0.065, 0.013, 8, 18, Math.PI), toon('#2b2e33'));
  handle.rotation.z = -Math.PI / 2;
  handle.rotation.y = Math.PI / 2;
  handle.position.set(0, 0.17, -0.085);
  g.add(handle);

  const tray = new THREE.Group();
  tray.position.set(-0.32, 0, 0.02);
  tray.add(box(0.3, 0.015, 0.2, '#6e4a30', 0, 0.0075, 0));
  ['#e74c3c', '#f5f5f5', '#3498db'].forEach((color, i) => {
    const mug = createMug(color);
    mug.rotation.x = Math.PI;
    mug.rotation.y = i * 1.3;
    mug.position.set(-0.085 + i * 0.085, 0.015 + MUG.h, i === 1 ? 0.03 : -0.02);
    tray.add(mug);
  });
  g.add(tray);
  return g;
}

/**
 * The bell at the head of the table: ring it to call everyone in, ring it
 * again to send them back. `ring()` bounces the button; the invisible box
 * round it makes it easy to click from far away.
 */
export function createBell() {
  const g = new THREE.Group();
  const brass = toon('#d4a73c');
  g.add(cyl(0.065, 0.07, 0.016, '#2b2e33', 20).translateY(0.008));
  const dome = mesh(new THREE.SphereGeometry(0.055, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), brass);
  dome.position.y = 0.016;
  g.add(dome);
  const button = new THREE.Group();
  button.position.y = 0.07;
  button.add(cyl(0.006, 0.006, 0.02, brass, 8).translateY(0.01));
  button.add(sphere(0.014, brass, 10).translateY(0.024));
  g.add(button);
  const reach = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.45), new THREE.MeshBasicMaterial({ visible: false }));
  reach.position.y = 0.1;
  g.add(reach);
  g.traverse((o) => { if (o.isMesh) o.userData.meetingBell = true; });
  let pressed = 0;
  return {
    group: g,
    ring() {
      pressed = 1;
    },
    update(dt) {
      pressed = Math.max(0, pressed - dt * 3);
      const k = Math.sin(pressed * Math.PI);
      button.position.y = 0.07 - k * 0.012;
      dome.scale.setScalar(1 + k * 0.08);
    },
  };
}
