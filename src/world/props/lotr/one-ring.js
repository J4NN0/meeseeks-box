import * as THREE from 'three';
import { cyl, mesh, noInk, ownToon, rng, sphere } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';
import { tengwarLine } from './tengwar.js';

// The One Ring (The Lord of the Rings): a plain, heavy band of gold, thick
// and domed like the Jens Hansen film prop, with the Black Speech verse
// burning on it as if just out of Bilbo's fire. It stands on a little dark
// plinth with a red cushion, upright and turned so you see its band.
//
// Origin: the bottom of the plinth. Faces +z.

const GOLD = '#f0b93a';
// Outer radius (at the top of the dome), band thickness and width.
const RADIUS = 0.04;
const THICK = 0.01;
const WIDTH = 0.022;

export function createOneRing() {
  const g = new THREE.Group();
  g.add(cyl(0.055, 0.06, 0.018, '#2a1c16', 28).translateY(0.009));
  const cushion = sphere(1, '#7a1622', 24);
  cushion.scale.set(0.046, 0.016, 0.046);
  cushion.position.y = 0.024;
  g.add(cushion);

  const ring = new THREE.Group();
  // Pressed a little into the cushion, turned to show the hole and the band.
  ring.position.y = 0.036 + RADIUS - 0.006;
  ring.rotation.y = -0.65;
  g.add(ring);
  const band = new THREE.Group();
  band.rotation.x = Math.PI / 2;
  ring.add(band);
  band.add(mesh(new THREE.LatheGeometry(profile(), 56), ownToon('#ffffff', { map: polish() })));

  const letters = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS + 0.0006, RADIUS + 0.0006, 0.012, 64, 1, true),
    new THREE.MeshBasicMaterial({ map: inscription(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  band.add(noInk(letters));
  return g;
}

/** The band's cross-section: domed outside, gently rounded inside. */
function profile() {
  const pts = [];
  const mid = RADIUS - THICK / 2;
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // A superellipse, rounder on the outside than the inside.
    const e = c > 0 ? 0.8 : 0.45;
    pts.push(new THREE.Vector2(mid + (THICK / 2) * Math.sign(c) * Math.abs(c) ** e, (WIDTH / 2) * Math.sign(s) * Math.abs(s) ** 0.55));
  }
  return pts;
}

/**
 * Polished gold: a bright streak along the outside, darker on the inside.
 * Along v the lathe goes edge, outside, edge, inside, back to the edge.
 */
function polish() {
  const { ctx, texture } = canvasTexture(4, 64);
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  const stops = [[0, GOLD], [0.18, GOLD], [0.27, '#fff0b0'], [0.33, '#ffe07a'], [0.4, GOLD], [0.55, '#c98a1c'], [0.85, '#b67a14'], [1, GOLD]];
  for (const [at, c] of stops) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  texture.needsUpdate = true;
  return texture;
}

/** The verse in fire letters, once round the outside of the band. */
function inscription() {
  const { ctx, texture } = canvasTexture(1024, 48);
  const r = rng(1954);
  ctx.shadowColor = '#e01e00';
  ctx.shadowBlur = 5;
  ctx.strokeStyle = ctx.fillStyle = '#ff7a1f';
  tengwarLine(ctx, 8, 32, 1010, r, 13);
  texture.needsUpdate = true;
  return texture;
}
