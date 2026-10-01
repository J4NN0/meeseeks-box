import * as THREE from 'three';
import { box, mesh, ownToon, rng, sphere, toon } from '../../../engine/toon.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../../screens.js';

// The Mask of Loki (The Mask, 1994): the weathered wooden mask Stanley
// fishes out of the river, all green-grey driftwood grain. Almond eye holes,
// a slot of a mouth, a broken top edge, and the riveted iron strip down the
// forehead and nose with Loki's seal at the top. Somebody stop me!
// Propped on a little stand, leaning back (`mount: 'stand'`), or hung flat
// on a wall or the pegboard by a cord over a peg (`mount: 'board'`).
//
// Origin: on a stand, the bottom of the stand; on a board, the middle of its
// back. Faces +z.

const W = 0.18;
const H = 0.235;
const THICK = 0.009;
const LEAN = 0.2;

export function createLokiMask({ mount = 'stand' } = {}) {
  const g = new THREE.Group();
  const mask = new THREE.Group();
  g.add(mask);
  mask.add(mesh(sheet(faceShape, faceZ, THICK, 60, 78), ownToon('#ffffff', { map: woodTexture(), side: THREE.DoubleSide })));
  mask.add(strip());
  if (mount === 'board') {
    hang(g, mask);
    return g;
  }
  // The stand: a foot and a post the mask leans on.
  const wood = toon('#4a3427');
  g.add(box(0.12, 0.014, 0.075, wood, 0, 0.007, 0));
  const post = box(0.018, 0.2, 0.018, wood, 0, 0.1, -0.055);
  post.rotation.x = -LEAN;
  g.add(post);
  mask.position.set(0, 0.016 + (H / 2) * Math.cos(LEAN), 0.012 - (H / 2) * Math.sin(LEAN));
  mask.rotation.x = -LEAN;
  return g;
}

/** Flat on the board, its rim just touching, hung by a cord over a peg. */
function hang(g, mask) {
  mask.position.z = 0.008;
  const peg = new THREE.Vector3(0, H / 2 + 0.03, 0.026);
  const iron = toon('#8b8f95');
  g.add(rod(new THREE.Vector3(peg.x, peg.y, 0), peg, 0.0035, iron));
  g.add(sphere(0.005, iron, 10).translateY(peg.y).translateZ(peg.z));
  // The cord, down to the back of the mask's top corners.
  const cord = toon('#3b2a1e');
  for (const side of [-1, 1]) g.add(rod(peg, new THREE.Vector3(side * 0.06, H * 0.43, 0.012), 0.0013, cord));
}

/** A thin round rod from `a` to `b`. */
function rod(a, b, radius, material) {
  const m = mesh(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8), material);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// The face, in u (-1 left to 1 right) and v (-1 chin to 1 top) ------------

const toUV = (x, y) => [x / (W / 2), y / (H / 2)];

/**
 * Where the wood is: below 0 on the mask, above it off the edge or in a
 * hole, and roughly by how far, so edges can be pulled onto the line.
 */
function faceShape(x, y) {
  const [u, v] = toUV(x, y);
  // A broken top edge, temples, then tapering to a round chin.
  const top = 0.93 - 0.05 * Math.abs(u) ** 3 + 0.025 * Math.sin(u * 23) * Math.sin(u * 7 + 1);
  const half = v > 0.2 ? 0.92 + 0.08 * (1 - (v - 0.2) / 0.8) : Math.sqrt(Math.max(0, 1 - ((0.2 - v) / 1.22) ** 2));
  let f = Math.max(v - top, Math.abs(u) - half);
  // Eye holes: wide ovals, flatter on top.
  for (const side of [-1, 1]) {
    const du = (u - side * 0.43) / 0.26;
    const dv = (v - 0.3 - side * du * 0.02) / (v > 0.3 ? 0.1 : 0.13);
    f = Math.max(f, (1 - Math.hypot(du, dv)) * 0.12);
  }
  // The mouth: a wide slot, flat along the top, round underneath.
  const mu = u / 0.34;
  const mv = (v + 0.5) / (v > -0.5 ? 0.055 : 0.09);
  const m = v > -0.5 ? (mu ** 4 + mv ** 4) ** 0.25 : Math.hypot(mu, mv);
  return Math.max(f, (1 - m) * 0.07);
}

/** How far the face stands out: domed, with a brow, cheekbones and a nose. */
function faceZ(x, y) {
  const [u, v] = toUV(x, y);
  let z = 0.036 * (1 - 0.9 * u * u) - 0.012 * v * v;
  z += 0.006 * Math.exp(-(((v - 0.47) / 0.08) ** 2)) * (1 - 0.4 * u * u);
  z += 0.006 * Math.exp(-(((Math.abs(u) - 0.45) / 0.2) ** 2) - ((v - 0.06) / 0.12) ** 2);
  const nose = Math.exp(-((u / 0.1) ** 2)) * THREE.MathUtils.smoothstep(v, -0.3, -0.12) * (1 - THREE.MathUtils.smoothstep(v, 0.3, 0.5));
  z += 0.014 * nose;
  z += 0.004 * Math.exp(-((u / 0.35) ** 2) - ((v + 0.52) / 0.14) ** 2);
  return z;
}

/**
 * A solid sheet `thick` deep: the cells of an `nx` by `ny` grid over the
 * mask that fall inside `shape` (see faceShape), raised to `front(x, y)`,
 * with a back and walls round every edge (holes too) so the ink lines find
 * them. Edge corners are pulled onto the outline so it isn't stepped.
 */
function sheet(shape, front, thick, nx, ny, bounds = { x0: -W / 2, x1: W / 2, y0: -H / 2, y1: H / 2 }) {
  const { x0, x1, y0, y1 } = bounds;
  const dx = (x1 - x0) / nx;
  const dy = (y1 - y0) / ny;
  const at = (i, j) => j * (nx + 1) + i;
  const xy = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) xy.push([x0 + dx * i, y0 + dy * j]);

  const cells = new Set();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) if (shape(x0 + dx * (i + 0.5), y0 + dy * (j + 0.5)) < 0) cells.add(j * nx + i);
  }
  const has = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && cells.has(j * nx + i);
  const quads = [];
  const edges = [];
  for (const c of cells) {
    const i = c % nx;
    const j = Math.floor(c / nx);
    const [a, b, d, e] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
    quads.push([a, b, d, e]);
    // An edge wherever the next cell over is missing, wound to face out.
    if (!has(i, j - 1)) edges.push([b, a]);
    if (!has(i + 1, j)) edges.push([d, b]);
    if (!has(i, j + 1)) edges.push([e, d]);
    if (!has(i - 1, j)) edges.push([a, e]);
  }

  // Newton steps onto the outline, never more than most of a cell.
  const h = Math.min(dx, dy) * 0.25;
  for (const k of new Set(edges.flat())) {
    let [x, y] = xy[k];
    for (let n = 0; n < 4; n++) {
      const f = shape(x, y);
      const gx = (shape(x + h, y) - shape(x - h, y)) / (2 * h);
      const gy = (shape(x, y + h) - shape(x, y - h)) / (2 * h);
      const g2 = gx * gx + gy * gy;
      if (g2 < 1e-12) break;
      x -= (f * gx) / g2;
      y -= (f * gy) / g2;
    }
    const [ox, oy] = xy[k];
    const step = Math.hypot(x - ox, y - oy);
    const max = Math.min(dx, dy) * 0.8;
    if (step > max) {
      x = ox + ((x - ox) * max) / step;
      y = oy + ((y - oy) * max) / step;
    }
    xy[k] = [x, y];
  }

  const point = (k, back) => {
    const [x, y] = xy[k];
    return [x, y, front(x, y) - back * thick];
  };
  const pts = [];
  const uvs = [];
  const tri = (p, q, r) => {
    for (const v of [p, q, r]) {
      pts.push(...v);
      uvs.push((v[0] + W / 2) / W, (v[1] + H / 2) / H);
    }
  };
  for (const [a, b, d, e] of quads) {
    tri(point(a, 0), point(b, 0), point(d, 0));
    tri(point(a, 0), point(d, 0), point(e, 0));
    tri(point(a, 1), point(d, 1), point(b, 1));
    tri(point(a, 1), point(e, 1), point(d, 1));
  }
  const faces = new THREE.BufferGeometry();
  faces.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  faces.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Smooth across the face: merge by position before taking normals.
  const smooth = mergeVertices(faces);
  smooth.computeVertexNormals();

  // Walls get their own corners so they shade flat, not blended into the face.
  const walls = [];
  for (const [p, q] of edges) walls.push(...point(p, 0), ...point(q, 0), ...point(q, 1), ...point(p, 0), ...point(q, 1), ...point(p, 1));
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3));
  sides.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((walls.length / 3) * 2), 2));
  sides.computeVertexNormals();
  return mergeGeometries([smooth.toNonIndexed(), sides]);
}

/** The iron strip down the middle, its rivets, and Loki's seal on top. */
function strip() {
  const g = new THREE.Group();
  const iron = toon('#8b8f95');
  const half = 0.012;
  const top = 0.9 * (H / 2);
  const bottom = -0.3 * (H / 2);
  const shape = (x, y) => Math.max(Math.abs(x) - half, y - top, bottom - y);
  const raised = (x, y) => faceZ(x, y) + 0.0035;
  g.add(mesh(sheet(shape, raised, 0.004, 6, 50, { x0: -half - 0.001, x1: half + 0.001, y0: bottom - 0.002, y1: top + 0.002 }), iron));
  for (let k = 0; k < 5; k++) {
    const y = top - 0.04 - k * 0.022;
    g.add(sphere(0.0035, '#6f7379', 8).translateY(y).translateZ(raised(0, y) + 0.0005));
  }
  const sealY = top - 0.016;
  const seal = mesh(new THREE.CircleGeometry(0.0105, 20), ownToon('#ffffff', { map: sealTexture() }), { cast: false });
  seal.position.set(0, sealY, raised(0, sealY) + 0.0008);
  g.add(seal);
  return g;
}

/** Green-grey driftwood with its grain running down the face. */
function woodTexture() {
  const S = 256;
  const { ctx, texture } = canvasTexture(S, S);
  const r = rng(1994);
  ctx.fillStyle = '#69684e';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = ['rgba(122, 96, 64, 0.4)', 'rgba(76, 96, 68, 0.4)', 'rgba(150, 150, 128, 0.3)'][i % 3];
    ctx.fillRect(r() * S, 0, 14 + r() * 34, S);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 42; i++) {
    ctx.strokeStyle = r() < 0.75 ? 'rgba(36, 30, 20, 0.5)' : 'rgba(176, 172, 146, 0.35)';
    ctx.lineWidth = 1 + r() * 1.8;
    ctx.beginPath();
    let x = r() * S;
    const sway = 4 + r() * 10;
    for (let y = -10; y <= S + 10; y += 12) {
      ctx.lineTo(x + Math.sin(y / 40 + i) * sway, y);
      x += (r() - 0.5) * 3;
    }
    ctx.stroke();
  }
  texture.needsUpdate = true;
  return texture;
}

/** Loki's seal: a ring round a twisting L. */
function sealTexture() {
  const S = 64;
  const { ctx, texture } = canvasTexture(S, S);
  ctx.fillStyle = '#9a9ea5';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#4b4e53';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(26, 14);
  ctx.bezierCurveTo(20, 26, 30, 34, 24, 46);
  ctx.lineTo(42, 46);
  ctx.stroke();
  texture.needsUpdate = true;
  return texture;
}
