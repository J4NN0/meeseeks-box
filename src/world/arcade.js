import * as THREE from 'three';
import { box, cyl, glow, mesh, noInk, sphere, toon } from '../engine/toon.js';
import { canvasTexture, glowTexture } from './screens.js';

// The arcade cabinet in the chill zone: "Roy: A Life Well Lived", from
// Blips and Chitz. An upright cabinet built round its side profile: a base
// with the coin door, the control panel jutting out (a joystick, six
// buttons, the 1P and 2P starts), the screen tipped back in its bezel with
// the speakers above, and the backlit marquee under the top. Not playable:
// the screen runs the attract loop.
//
// Built facing +z, its back at z = BACK: turn the group to put it against a wall.

/** The side profile, from the back of the floor round the front: [z, y]. */
const PROFILE = [
  [-0.42, 0], [0.36, 0], [0.36, 0.84], [0.46, 0.86], [0.46, 0.94],
  [0.18, 1.03], [0.05, 1.56], [0.2, 1.6], [0.2, 1.86], [-0.42, 1.86],
];
const BACK = -0.42;
const WIDTH = 0.7;
const SIDE = 0.035;
const INNER = WIDTH - 2 * SIDE;
/** The control deck and the screen slope, front to back and bottom to top. */
const DECK = [PROFILE[4], PROFILE[5]];
const SLOPE = [PROFILE[5], PROFILE[6]];
const SCREEN = { w: 0.48, h: 0.36, y: -0.05, px: [384, 288], fps: 12 };

const COLORS = {
  body: '#3a2470',
  trim: '#ff5fa2',
  black: '#17131c',
  bezel: '#221a2e',
  metal: '#9aa1ab',
  slot: '#ff4b3e',
};
const BUTTONS = [
  { name: 'a', color: '#ff5fa2', at: [0.0, 0.032] },
  { name: 'b', color: '#ffd166', at: [0.072, 0.022] },
  { name: 'c', color: '#6ec6ee', at: [0.144, 0.026] },
  { name: 'd', color: '#97ce4c', at: [0.0, -0.036] },
  { name: 'e', color: '#ff8a3d', at: [0.072, -0.046] },
  { name: 'f', color: '#b07cff', at: [0.144, -0.042] },
];
const STARTS = [
  { name: 'start1', at: [-0.04, -0.1] },
  { name: 'start2', at: [0.03, -0.1] },
];
const STICK = [-0.17, 0.0];

export function createArcade() {
  const group = new THREE.Group();

  // Cabinet ---------------------------------------------------------------
  const cabinet = new THREE.Group();
  group.add(cabinet);
  const shape = new THREE.Shape(PROFILE.map(([z, y]) => new THREE.Vector2(z, y)));
  const sideGeometry = new THREE.ExtrudeGeometry(shape, { depth: SIDE, bevelEnabled: false });
  // Shape x is the depth, y the height, the extrusion its thickness across.
  sideGeometry.rotateY(-Math.PI / 2);
  for (const s of [-1, 1]) {
    const side = mesh(sideGeometry, toon(COLORS.body));
    side.position.x = s > 0 ? WIDTH / 2 : -WIDTH / 2 + SIDE;
    cabinet.add(side);
    cabinet.add(molding(s * (WIDTH / 2 - SIDE / 2)));
    cabinet.add(sideArt(s));
  }

  cabinet.add(box(INNER, 1.86, 0.02, COLORS.body, 0, 0.93, BACK + 0.01));
  cabinet.add(box(INNER, 0.02, 0.62, COLORS.body, 0, 1.85, -0.11));
  cabinet.add(box(INNER, 0.1, 0.02, COLORS.black, 0, 0.05, 0.35));
  cabinet.add(box(INNER, 0.74, 0.02, COLORS.body, 0, 0.47, 0.35));
  // The front of the control panel and its underside, back to the base.
  cabinet.add(box(INNER, 0.08, 0.02, COLORS.black, 0, 0.9, 0.45));
  cabinet.add(along([0.36, 0.84], [0.46, 0.86], box(INNER, 0.02, 1, COLORS.body, 0, 0.01, 0)));
  cabinet.add(coinDoor());

  // The overhang under the marquee, and the marquee itself: lit from behind.
  cabinet.add(along(SLOPE[1], PROFILE[7], box(INNER, 0.02, 1, COLORS.black, 0, 0.01, 0)));
  const marquee = mesh(new THREE.PlaneGeometry(INNER, 0.2), new THREE.MeshBasicMaterial({ map: marqueeTexture(), toneMapped: false }), { cast: false });
  marquee.position.set(0, 1.73, 0.201);
  cabinet.add(marquee);
  for (const y of [1.615, 1.845]) cabinet.add(box(INNER, 0.022, 0.012, COLORS.metal, 0, y, 0.205));

  // Control panel ---------------------------------------------------------
  // Its local y is the deck's normal, z towards the player.
  const deck = along(DECK[1], DECK[0], box(INNER, 0.03, 1, COLORS.black, 0, -0.015, 0));
  deck.add(box(INNER, 0.002, 0.03, COLORS.trim, 0, 0.001, deckLength() / 2 - 0.025, { cast: false }));
  group.add(deck);

  const stick = new THREE.Group();
  stick.position.set(STICK[0], 0, STICK[1]);
  stick.add(cyl(0.034, 0.034, 0.005, COLORS.metal, 24).translateY(0.0025));
  stick.add(cyl(0.022, 0.022, 0.004, '#d9534f', 20).translateY(0.007));
  stick.add(cyl(0.006, 0.006, 0.065, COLORS.metal, 10).translateY(0.04));
  stick.add(sphere(0.022, '#d9534f', 18).translateY(0.08));
  deck.add(stick);

  for (const b of [...BUTTONS, ...STARTS]) {
    const start = !b.color;
    const r = start ? 0.012 : 0.017;
    const button = new THREE.Group();
    button.position.set(b.at[0], 0, b.at[1]);
    button.add(cyl(r + 0.004, r + 0.004, 0.006, COLORS.black, 20).translateY(0.003));
    const material = start ? glow('#fff1b8') : toon(b.color);
    button.add(cyl(r, r, 0.012, material, 20).translateY(0.008));
    const dome = mesh(new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), material);
    dome.position.y = 0.014;
    dome.scale.y = 0.3;
    button.add(dome);
    deck.add(button);
  }

  // Screen ----------------------------------------------------------------
  // Its local y runs up the slope, z out of the glass.
  const bezel = along(SLOPE[0], SLOPE[1], box(INNER, 1, 0.02, COLORS.bezel, 0, 0, -0.01), 'up');
  group.add(bezel);
  const sy = SCREEN.y;
  for (const [w, h, x, y] of [
    [SCREEN.w + 0.05, 0.025, 0, sy + SCREEN.h / 2 + 0.0125],
    [SCREEN.w + 0.05, 0.025, 0, sy - SCREEN.h / 2 - 0.0125],
    [0.025, SCREEN.h, -SCREEN.w / 2 - 0.0125, sy],
    [0.025, SCREEN.h, SCREEN.w / 2 + 0.0125, sy],
  ]) bezel.add(box(w, h, 0.014, COLORS.black, x, y, 0.007));
  const screen = canvasTexture(...SCREEN.px);
  const glass = mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false }), { cast: false });
  glass.position.set(0, sy, 0.003);
  bezel.add(glass);
  // Speakers above the screen, and the maker's plate between them.
  for (const s of [-1, 1]) bezel.add(speaker(s * 0.18, 0.205));
  bezel.add(box(0.12, 0.03, 0.006, COLORS.trim, 0, 0.205, 0.003, { cast: false }));

  // The screen's light, spilling onto the floor in front of it.
  const spill = noInk(mesh(new THREE.PlaneGeometry(1.3, 1.1), new THREE.MeshBasicMaterial({
    map: glowTexture([[0, 'rgba(140,110,255,0.45)'], [1, 'rgba(140,110,255,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), { cast: false, receive: false }));
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.006, 0.75);
  group.add(spill);

  // Coin slots, blinking until someone puts a coin in.
  const slots = new THREE.MeshBasicMaterial({ color: COLORS.slot, toneMapped: false });
  cabinet.traverse((o) => { if (o.userData.coinSlot) o.material = slots; });

  // ------------------------------------------------------------------------
  let frame = 0;

  function update(dt, t) {
    slots.color.set(COLORS.slot).multiplyScalar(Math.sin(t * 5) > 0 ? 1 : 0.35);
    frame += dt;
    if (frame < 1 / SCREEN.fps) return;
    frame = 0;
    attract(screen.ctx, t);
    screen.ctx.drawImage(scanlines(), 0, 0);
    screen.texture.needsUpdate = true;
  }

  return { group, update };
}

// --------------------------------------------------------------- building

/**
 * Lays `part` along the profile from `a` to `b` ([z, y]), centred between
 * them and stretched to fit: its z (or y, with 'up') runs from a to b.
 */
function along(a, b, part, axis = 'z') {
  const g = new THREE.Group();
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  g.position.set(0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
  const length = Math.hypot(dz, dy);
  if (axis === 'up') {
    g.rotation.x = Math.atan2(dz, dy);
    part.scale.y = length;
  } else {
    g.rotation.x = Math.atan2(-dy, dz);
    part.scale.z = length;
  }
  g.add(part);
  return g;
}

function deckLength() {
  return Math.hypot(DECK[1][0] - DECK[0][0], DECK[1][1] - DECK[0][1]);
}

/** The T-molding round a side panel's edge: rods along it, balls at the corners. */
function molding(x) {
  const g = new THREE.Group();
  const r = 0.021;
  PROFILE.forEach(([z, y], i) => {
    const [nz, ny] = PROFILE[(i + 1) % PROFILE.length];
    if (y === 0 && ny === 0) return;
    g.add(along([z, y], [nz, ny], mesh(rodGeometry(), toon(COLORS.trim))));
    if (y > 0) g.add(sphere(r, COLORS.trim, 10).translateZ(z).translateY(y));
  });
  g.position.x = x;
  return g;
}

// Built once and shared by every office's arcade, so disposing one leaves it be.
let rod;
/** A unit rod along z, the molding's radius, for along() to stretch. */
function rodGeometry() {
  if (rod) return rod;
  rod = new THREE.CylinderGeometry(0.021, 0.021, 1, 8).rotateX(Math.PI / 2);
  rod.userData.shared = true;
  return rod;
}

function coinDoor() {
  const g = new THREE.Group();
  g.position.set(0, 0.5, 0.36);
  g.add(box(0.3, 0.34, 0.012, COLORS.metal, 0, 0, 0.006));
  g.add(box(0.27, 0.31, 0.004, '#7f8691', 0, 0, 0.013));
  for (const s of [-1, 1]) {
    const x = s * 0.07;
    g.add(box(0.075, 0.11, 0.014, '#5c6370', x, 0.06, 0.016));
    const slot = box(0.012, 0.05, 0.004, COLORS.slot, x, 0.07, 0.024, { cast: false });
    slot.userData.coinSlot = true;
    g.add(slot);
    g.add(box(0.03, 0.012, 0.004, '#d8dde3', x, 0.025, 0.024, { cast: false }));
    // The coin return, under the slot.
    g.add(box(0.05, 0.035, 0.01, COLORS.black, x, -0.06, 0.02));
  }
  g.add(cyl(0.012, 0.012, 0.01, '#d8dde3', 12).rotateX(Math.PI / 2).translateY(-0.13).translateZ(0.02).translateX(0.1));
  return g;
}

function speaker(x, y) {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  g.add(cyl(0.05, 0.05, 0.006, COLORS.black, 24).rotateX(Math.PI / 2).translateY(0.003));
  for (const r of [0.038, 0.024, 0.01]) g.add(cyl(r, r, 0.004, r === 0.024 ? COLORS.black : '#3d3448', 20).rotateX(Math.PI / 2).translateY(0.006));
  return g;
}

/** The art down each side, on the outside: a pink sweep and the title. */
function sideArt(s) {
  // Inside the panel's outline: under the control panel, clear of the molding.
  const plane = mesh(new THREE.PlaneGeometry(0.7, 0.82), new THREE.MeshBasicMaterial({ map: sideTexture(), transparent: true, toneMapped: false }), { cast: false });
  plane.material.color.set('#cfc8e8');
  plane.rotation.y = s * Math.PI / 2;
  plane.position.set(s * (WIDTH / 2 + 0.001), 0.53, -0.03);
  return noInk(plane);
}

// ---------------------------------------------------------------- artwork
// Painted once and shared by every office's arcade, so disposing one leaves them be.

let sideMap;
function sideTexture() {
  if (sideMap) return sideMap;
  const { canvas, ctx, texture } = canvasTexture(350, 410);
  texture.userData.shared = true;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = '#ff5fa2';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.95);
  ctx.bezierCurveTo(w * 0.35, h * 0.7, w * 0.55, h * 0.45, w, h * 0.12);
  ctx.lineTo(w, h * 0.3);
  ctx.bezierCurveTo(w * 0.6, h * 0.58, w * 0.4, h * 0.8, w * 0.1, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = '#6ec6ee';
  for (let i = 0; i < 7; i++) {
    const x = 40 + ((i * 97) % (w - 80));
    const y = 40 + ((i * 151) % (h * 0.55));
    star(ctx, x, y, 10 + (i % 3) * 5);
  }
  const draw = () => {
    ctx.save();
    ctx.translate(w * 0.42, h * 0.62);
    ctx.rotate(-0.6);
    ctx.textAlign = 'center';
    ctx.font = '88px "Luckiest Guy", "Arial Rounded MT Bold", system-ui';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#17131c';
    ctx.strokeText('ROY', 0, 0);
    ctx.fillStyle = '#ffd166';
    ctx.fillText('ROY', 0, 0);
    ctx.restore();
    texture.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return (sideMap = texture);
}

let marqueeMap;
function marqueeTexture() {
  if (marqueeMap) return marqueeMap;
  const { canvas, ctx, texture } = canvasTexture(640, 200);
  texture.userData.shared = true;
  const { width: w, height: h } = canvas;
  const draw = () => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#2a1458');
    bg.addColorStop(1, '#5b1f6e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // Rays from behind the title.
    ctx.save();
    ctx.translate(w / 2, h * 0.55);
    ctx.fillStyle = 'rgba(255,95,162,0.25)';
    for (let i = 0; i < 16; i++) {
      ctx.rotate((Math.PI * 2) / 16);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, -40);
      ctx.lineTo(w, 40);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#6ec6ee';
    star(ctx, 60, 50, 14);
    star(ctx, w - 70, 140, 12);
    star(ctx, w - 110, 45, 8);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.font = '108px "Luckiest Guy", "Arial Rounded MT Bold", system-ui';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#17131c';
    ctx.strokeText('ROY', w / 2, 118);
    ctx.fillStyle = '#ffd166';
    ctx.fillText('ROY', w / 2, 118);
    ctx.font = '600 30px "Patrick Hand", "Marker Felt", system-ui';
    ctx.fillStyle = '#ffe3f1';
    ctx.fillText('A LIFE WELL LIVED', w / 2, 160);
    ctx.font = '600 18px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#97ce4c';
    ctx.fillText('BLIPS AND CHITZ', w / 2, 188);
    texture.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return (marqueeMap = texture);
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const d = i % 2 ? r * 0.35 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.fill();
}

/** Roy, eight pixels wide: hair, face, shirt, trousers, shoes. */
const ROY = [
  '..hhhh..',
  '.hhhhhh.',
  '.ffffff.',
  '.f.ff.f.',
  '.ffffff.',
  '..ffff..',
  '.ssssss.',
  'ssssssss',
  'f.ssss.f',
  '..pppp..',
  '..p..p..',
  '.oo..oo.',
];
const ROY_COLORS = { h: '#6b4226', f: '#f2c6a0', s: '#3d8bd9', p: '#2b2b44', o: '#17131c' };

/** The attract loop: the title, Roy walking through his life, insert coin. */
function attract(ctx, t) {
  const { width: w, height: h } = ctx.canvas;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#120a2e');
  sky.addColorStop(1, '#3a1d63');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Stars drifting by, and the ground.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 24; i++) {
    const x = (((i * 73 - t * (8 + (i % 3) * 6)) % w) + w) % w;
    ctx.fillRect(Math.round(x), (i * 41) % (h * 0.6), 2, 2);
  }
  const ground = h - 46;
  ctx.fillStyle = '#2f7a3a';
  ctx.fillRect(0, ground, w, h - ground);
  ctx.fillStyle = '#97ce4c';
  ctx.fillRect(0, ground, w, 4);

  ctx.textAlign = 'center';
  ctx.font = 'bold 72px ui-monospace, Menlo, monospace';
  const bob = Math.round(Math.sin(t * 2) * 4);
  ctx.fillStyle = '#ff5fa2';
  ctx.fillText('ROY', w / 2 + 4, 92 + bob + 4);
  ctx.fillStyle = '#ffd166';
  ctx.fillText('ROY', w / 2, 92 + bob);
  ctx.font = 'bold 18px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#ffe3f1';
  ctx.fillText('A LIFE WELL LIVED', w / 2, 124);

  // Roy walks across, two frames of legs.
  const px = 4;
  const x0 = Math.round(((t * 40) % (w + 60)) - 40);
  const walk = Math.floor(t * 6) % 2;
  ROY.forEach((row, y) => {
    const r = walk && y >= 10 ? (y === 10 ? '.p....p.' : 'oo....oo') : row;
    [...r].forEach((c, x) => {
      if (c === '.') return;
      ctx.fillStyle = ROY_COLORS[c];
      ctx.fillRect(x0 + x * px, ground - ROY.length * px + y * px, px, px);
    });
  });

  if (Math.floor(t * 1.6) % 2 === 0) {
    ctx.font = 'bold 20px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('INSERT COIN', w / 2, 178);
  }
  ctx.font = 'bold 12px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#cfe8ff';
  ctx.fillText('© BLIPS AND CHITZ', w / 2, h - 16);
}

let overlay;
/** CRT scanlines and a dark rim, drawn once, to lay over whatever's on the screen. */
function scanlines() {
  if (overlay) return overlay;
  overlay = document.createElement('canvas');
  [overlay.width, overlay.height] = SCREEN.px;
  const ctx = overlay.getContext('2d');
  const { width: w, height: h } = overlay;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  const rim = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, w, h);
  return overlay;
}
