import * as THREE from 'three';
import { PALETTE, cyl, mesh, noInk, ownToon, rng, sphere, toon } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';
import { tengwa } from './tengwar.js';

// Andúril, the Flame of the West: Narsil reforged for Aragorn (The Return of
// the King), hung point down on its display plaque. After the Weta prop: a
// long flared pommel with a gold-lined window, a short black leather grip, a
// straight guard with fanned, gold-inlaid ends and a langet down the blade,
// and a broad bright blade with runes and stars etched along its fuller.
// The plaque is the official one: dark wood with the White Tree of Gondor
// and its seven stars in gold.
//
// Origin: the middle of the guard, on the wall. Faces +z, pommel up.

const STEEL = '#a2abb7';
const BLADE = '#c9d1db';
const GOLD = '#e0b54c';
const LEATHER = '#2a2623';
const RIM = '#1d1612';

const BLADE_LENGTH = 1.03;
const BLADE_WIDTH = 0.05;
const GRIP_LENGTH = 0.11;
const GRIP_Y = 0.014;
const POMMEL_Y = GRIP_Y + GRIP_LENGTH + 0.01;
// The sword stands off the wall, in front of the plaque.
const SWORD_Z = 0.048;

export function createAnduril() {
  const g = new THREE.Group();
  g.add(plaque());
  const sword = new THREE.Group();
  sword.position.z = SWORD_Z;
  sword.add(blade(), guard(), grip(), pommel());
  // Too thin for the shadow map: its shadow on the wall came out dashed.
  sword.traverse((o) => { o.castShadow = false; });
  g.add(sword);
  return g;
}

function blade() {
  const g = new THREE.Group();
  const bevel = 0.0035;
  const w = BLADE_WIDTH / 2 - bevel;
  const L = BLADE_LENGTH;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w * 0.7, -L + 0.14);
  s.quadraticCurveTo(w * 0.6, -L + 0.05, 0, -L + bevel);
  s.quadraticCurveTo(-w * 0.6, -L + 0.05, -w * 0.7, -L + 0.14);
  s.closePath();
  // A steep chamfer for the sharpened edge: it also gets the blade inked all
  // the way round, where its small step off the wall alone came out dashed.
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.001, bevelThickness: 0.005, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
  geo.translate(0, -0.012, -0.0005);
  g.add(mesh(geo, toon(BLADE)));
  // Flat against the wall the edges only got inked here and there: a sliver
  // of ink behind the blade, just wider than it, outlines it the whole way.
  const ink = new THREE.ExtrudeGeometry(s, { depth: 0.0005, bevelEnabled: true, bevelThickness: 0.0002, bevelSize: bevel + 0.0016, bevelSegments: 1, curveSegments: 8 });
  ink.translate(0, -0.012, -0.0072);
  g.add(noInk(mesh(ink, new THREE.MeshBasicMaterial({ color: PALETTE.ink }), { cast: false })));

  const etch = mesh(new THREE.PlaneGeometry(BLADE_WIDTH, 0.84), ownToon('#ffffff', { map: etchTexture(), transparent: true }), { cast: false });
  etch.position.set(0, -0.032 - 0.42, 0.0057);
  g.add(noInk(etch));
  return g;
}

/** The fuller, the rayed sun by the guard, and runes between little stars. */
function etchTexture() {
  const W = 64;
  const H = 1024;
  const { ctx, texture } = canvasTexture(W, H);
  const cx = W / 2;
  ctx.fillStyle = 'rgba(112, 122, 134, 0.42)';
  ctx.beginPath();
  ctx.roundRect(cx - 9, 70, 18, H - 90, 9);
  ctx.fill();

  ctx.strokeStyle = 'rgba(78, 86, 98, 0.85)';
  ctx.fillStyle = 'rgba(78, 86, 98, 0.85)';
  ctx.lineCap = 'round';
  // The sun, rays reaching across the blade.
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 2 ? 11 : 24;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 5, 34 + Math.sin(a) * 5);
    ctx.lineTo(cx + Math.cos(a) * len, 34 + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, 34, 4, 0, Math.PI * 2);
  ctx.fill();

  const r = rng(1380);
  let y = 100;
  let stars = 0;
  while (y < H - 40) {
    for (let i = 0; i < 4 && y < H - 40; i++, y += 30) rune(ctx, cx, y, r);
    if (stars++ < 7) star(ctx, cx, y + 2, 6, 6);
    y += 30;
  }
  texture.needsUpdate = true;
  return texture;
}

/** An angular rune: a stave with a branch or two, like the Cirth. */
function rune(ctx, x, y, r) {
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x - 1, y - 11);
  ctx.lineTo(x - 1, y + 11);
  const kinds = Math.floor(r() * 5);
  const side = r() < 0.5 ? -1 : 1;
  if (kinds === 0 || kinds === 3) { ctx.moveTo(x - 1, y - 9); ctx.lineTo(x + side * 7, y - 2); }
  if (kinds === 1 || kinds === 3) { ctx.moveTo(x - 1, y + 2); ctx.lineTo(x + side * 7, y + 9); }
  if (kinds === 2) { ctx.moveTo(x - 1, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x - 1, y + 6); }
  if (kinds === 4) { ctx.moveTo(x - 7, y - 9); ctx.lineTo(x + 6, y + 4); }
  ctx.stroke();
}

function star(ctx, x, y, radius, points, inner = 0.42) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const d = i % 2 ? radius * inner : radius;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
}

function guard() {
  const g = new THREE.Group();
  // The bar thins towards the ends, then fans out, more towards the grip;
  // a V langet runs down over the blade. Right half first, then mirrored.
  const s = new THREE.Shape();
  s.moveTo(0, 0.014);
  s.lineTo(0.03, 0.013);
  s.lineTo(0.036, 0.009);
  s.lineTo(0.118, 0.004);
  s.quadraticCurveTo(0.142, 0.006, 0.152, 0.021);
  s.quadraticCurveTo(0.159, 0.004, 0.153, -0.012);
  s.quadraticCurveTo(0.14, -0.006, 0.118, -0.004);
  s.lineTo(0.036, -0.009);
  s.lineTo(0.03, -0.014);
  s.lineTo(0.026, -0.016);
  s.lineTo(0, -0.046);
  s.lineTo(-0.026, -0.016);
  s.lineTo(-0.03, -0.014);
  s.lineTo(-0.036, -0.009);
  s.lineTo(-0.118, -0.004);
  s.quadraticCurveTo(-0.14, -0.006, -0.153, -0.012);
  s.quadraticCurveTo(-0.159, 0.004, -0.152, 0.021);
  s.quadraticCurveTo(-0.142, 0.006, -0.118, 0.004);
  s.lineTo(-0.036, 0.009);
  s.lineTo(-0.03, 0.013);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 8 });
  geo.translate(0, 0, -0.007);
  g.add(mesh(geo, toon(STEEL)));

  // Gold set into each fanned end, and a stud on the langet.
  const lens = new THREE.Shape();
  lens.moveTo(0, -0.011);
  lens.quadraticCurveTo(0.006, 0, 0, 0.012);
  lens.quadraticCurveTo(-0.006, 0, 0, -0.011);
  for (const side of [-1, 1]) {
    const inlay = mesh(new THREE.ShapeGeometry(lens, 6), toon(GOLD), { cast: false });
    inlay.position.set(side * 0.1505, 0.004, 0.0105);
    inlay.rotation.z = side * -0.12;
    g.add(noInk(inlay));
  }
  g.add(sphere(0.0035, GOLD, 8).translateY(-0.024).translateZ(0.01));
  return g;
}

function grip() {
  const g = new THREE.Group();
  const leather = toon(LEATHER);
  const core = cyl(0.0185, 0.021, GRIP_LENGTH, leather, 20);
  core.position.y = GRIP_Y + GRIP_LENGTH / 2;
  g.add(core);
  // The cord bindings under the leather show as ridges.
  for (let i = 1; i <= 5; i++) {
    const k = i / 6;
    const ridge = mesh(new THREE.TorusGeometry(0.021 - 0.0025 * k, 0.0022, 6, 20), leather);
    ridge.rotation.x = Math.PI / 2;
    ridge.position.y = GRIP_Y + GRIP_LENGTH * k;
    g.add(ridge);
  }
  g.add(cyl(0.0235, 0.0235, 0.01, STEEL, 20).translateY(GRIP_Y + GRIP_LENGTH + 0.005));
  // An oval grip, flatter front to back.
  g.scale.z = 0.8;
  return g;
}

function pommel() {
  const g = new THREE.Group();
  g.position.y = POMMEL_Y;
  // Right half: a slim neck flaring to beaked corners, an arched point on
  // top, and half of the window. The halves meet at an angle, so a ridge
  // runs up the middle.
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.021, 0);
  s.bezierCurveTo(0.018, 0.02, 0.019, 0.04, 0.024, 0.06);
  s.bezierCurveTo(0.03, 0.09, 0.045, 0.12, 0.052, 0.145);
  s.quadraticCurveTo(0.036, 0.165, 0, 0.18);
  s.lineTo(0, 0.161);
  s.quadraticCurveTo(0.017, 0.16, 0.021, 0.153);
  s.lineTo(0, 0.13);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelThickness: 0.004, bevelSize: 0.0025, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -0.007);
  const steel = toon(STEEL);
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.y = side * 0.22;
    const m = mesh(geo, steel);
    m.scale.x = side;
    half.add(m);
    g.add(half);
  }

  // Gold lining the window.
  const win = new THREE.Shape();
  win.moveTo(0, 0.13);
  win.lineTo(0.021, 0.153);
  win.quadraticCurveTo(0.017, 0.16, 0, 0.161);
  win.quadraticCurveTo(-0.017, 0.16, -0.021, 0.153);
  win.closePath();
  const hole = new THREE.Path();
  hole.moveTo(0, 0.1365);
  hole.lineTo(0.0145, 0.152);
  hole.quadraticCurveTo(0.012, 0.1565, 0, 0.157);
  hole.quadraticCurveTo(-0.012, 0.1565, -0.0145, 0.152);
  hole.closePath();
  win.holes.push(hole);
  const lining = new THREE.ExtrudeGeometry(win, { depth: 0.017, bevelEnabled: false, curveSegments: 6 });
  lining.translate(0, 0, -0.0085);
  g.add(mesh(lining, toon(GOLD)));
  return g;
}

// The plaque ------------------------------------------------------------------

// Its outline: a dome behind the guard, a waist, an anvil foot.
const PLAQUE = { top: 0.123, bottom: -0.455, half: 0.152 };
// The artwork's pixels per metre, and plaque coordinates to canvas ones.
const PX = 1316;
const X = (x) => (x + PLAQUE.half) * PX;
const Y = (y) => (PLAQUE.top - y) * PX;

function plaque() {
  const s = new THREE.Shape();
  s.moveTo(0, PLAQUE.top);
  s.bezierCurveTo(0.09, 0.123, 0.152, 0.075, 0.152, -0.005);
  s.bezierCurveTo(0.152, -0.085, 0.072, -0.11, 0.072, -0.2);
  s.lineTo(0.072, -0.26);
  s.bezierCurveTo(0.072, -0.32, 0.128, -0.33, 0.136, -0.385);
  s.bezierCurveTo(0.142, -0.43, 0.125, -0.455, 0.095, -0.455);
  s.lineTo(-0.095, -0.455);
  s.bezierCurveTo(-0.125, -0.455, -0.142, -0.43, -0.136, -0.385);
  s.bezierCurveTo(-0.128, -0.33, -0.072, -0.32, -0.072, -0.26);
  s.lineTo(-0.072, -0.2);
  s.bezierCurveTo(-0.072, -0.11, -0.152, -0.085, -0.152, -0.005);
  s.bezierCurveTo(-0.152, 0.075, -0.09, 0.123, 0, PLAQUE.top);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.016, bevelThickness: 0.006, bevelSize: 0.007, bevelSegments: 2, curveSegments: 16 });
  geo.translate(0, 0, 0.006);
  // The faces map the plaque's own coordinates: fit the artwork to them.
  const map = plaqueTexture();
  const w = PLAQUE.half * 2;
  const h = PLAQUE.top - PLAQUE.bottom;
  map.repeat.set(1 / w, 1 / h);
  map.offset.set(PLAQUE.half / w, -PLAQUE.bottom / h);
  return mesh(geo, [ownToon('#ffffff', { map }), toon(RIM)]);
}

function plaqueTexture() {
  const W = Math.round(PLAQUE.half * 2 * PX);
  const H = Math.round((PLAQUE.top - PLAQUE.bottom) * PX);
  const { ctx, texture } = canvasTexture(W, H);
  const r = rng(7);

  // Dark wood, redder in the middle, with its grain running down.
  const wood = ctx.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.45, H * 0.6);
  wood.addColorStop(0, '#7c4632');
  wood.addColorStop(1, '#3b1f17');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(28, 12, 8, 0.28)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 46; i++) {
    const x = r() * W;
    const wave = 3 + r() * 6;
    ctx.beginPath();
    for (let y = 0; y <= H; y += 20) ctx.lineTo(x + Math.sin(y / 60 + i) * wave, y);
    ctx.stroke();
  }

  ctx.strokeStyle = ctx.fillStyle = '#ecd29a';
  ctx.lineCap = 'round';

  // The White Tree: branches sweeping out and up from behind the grip,
  // roots curling out under the guard, leaves all along.
  const branch = (x0, y0, c1, c2, x1, y1, width) => {
    for (const side of [-1, 1]) {
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(X(side * x0), Y(y0));
      ctx.bezierCurveTo(X(side * c1[0]), Y(c1[1]), X(side * c2[0]), Y(c2[1]), X(side * x1), Y(y1));
      ctx.stroke();
      for (let k = 0.35; k <= 1; k += 0.22) leaf(ctx, bezierAt([side * x0, y0], [side * c1[0], c1[1]], [side * c2[0], c2[1]], [side * x1, y1], k), r);
    }
  };
  branch(0.01, 0.0, [0.05, 0.0], [0.09, 0.02], 0.115, 0.07, 6);
  branch(0.01, 0.025, [0.05, 0.03], [0.07, 0.06], 0.075, 0.098, 5);
  branch(0.01, 0.05, [0.03, 0.06], [0.04, 0.09], 0.03, 0.112, 4);
  branch(0.01, -0.012, [0.05, -0.02], [0.08, -0.06], 0.11, -0.03, 5);
  branch(0.01, -0.03, [0.03, -0.06], [0.06, -0.07], 0.068, -0.05, 4);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.04 + r() * 0.08;
    leaf(ctx, [Math.cos(a) * d * 1.1, 0.02 + Math.sin(a) * d * 0.8], r);
  }
  // The seven stars, in an arc over the tree.
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.06 + (i / 6) * 0.88);
    star(ctx, X(Math.cos(a) * 0.13), Y(0.012 + Math.sin(a) * 0.098), 13, 8, 0.4);
  }

  // A crescent moon at the foot, between lines of Elvish script.
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(X(0), Y(-0.355), 0.04 * PX, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  for (const side of [-1, 1]) {
    for (let line = 0; line < 3; line++) {
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.5 - side * (0.2 + i * 0.075));
        const d = 0.08 + line * 0.022;
        tengwa(ctx, X(Math.cos(a) * d), Y(-0.35 - Math.sin(a) * d * 0.9 + 0.08), r, 7);
      }
    }
  }
  texture.needsUpdate = true;
  return texture;
}

function bezierAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const b = (i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  return [b(0), b(1)];
}

/** A little leaf at `x, y` on the plaque, at a random angle. */
function leaf(ctx, [x, y], r) {
  ctx.save();
  ctx.translate(X(x), Y(y));
  ctx.rotate(r() * Math.PI * 2);
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
