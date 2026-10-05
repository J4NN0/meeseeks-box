import * as THREE from 'three';
import { mesh, ownToon, rng, toon } from '../../../engine/toon.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../../screens.js';
import { roundedRect } from '../shapes.js';
import { PEG, peg, rod } from '../hanging.js';

// Frank's mask (Donnie Darko, 2001): the head of the rabbit suit Frank wears
// when he tells Donnie the world will end in 28 days. After the screen-used
// mask Dale Brady and Rob Burman sculpted to Richard Kelly's design, between
// its test pull (56 x 23 x 13cm) and the licensed replica (53 x 22 x 15cm):
// a gaunt, half-coyote skull of a face in scuffed silver, matte-white eyes
// under a furrowed V of a brow, a long ridge of a nose, a grin of crooked
// yellow teeth, and two tall knobbly ears growing out of the crown, the left
// leaning out and the right bent over at the tip. Off the suit, without its
// fur hood, the way the mask itself hangs on a wall: by a cord from the
// crown over a peg between its ears.
//
// Origin: the middle of its back, on the board. Faces +z.

const SILVER = '#8f949b';
// The face's silver, its grime and its rubbed highlights, for painting.
const METAL = [0x8f, 0x94, 0x9b];
const GRIME = [0x4a, 0x45, 0x3f];
const SHINE = [0xd6, 0xda, 0xdf];
const INNER_EAR = '#5f584f';
const EYE = '#e2e6e1';
const TOOTH = '#d8ca8e';

// The face, with its eye line at 0: from the chin, just under the teeth, up
// to the crown where the ears grow out; its rim, resting on the board; how
// far its middle domes out, so the nose stands 15cm off the board, as deep
// as the real one; and how far the crown rounds down to the ears. 23cm
// across.
const FACE = { top: 0.15, bottom: -0.135, rim: 0.004, dome: 0.085, crown: 0.035 };
// Its half width going up: a narrow jaw, wide cheekbones and brow, and a
// crown narrowing to the ears.
const WIDTH = [[-0.135, 0.045], [-0.115, 0.068], [-0.09, 0.085], [-0.06, 0.1], [-0.02, 0.117], [0.02, 0.118], [0.085, 0.106], [0.15, 0.075]];

export function createFrankMask() {
  const g = new THREE.Group();
  g.add(face(), eyes(), teeth());
  const ears = toon('#ffffff', { vertexColors: true });
  // Rooted under the forehead. The left leans out; the right stands up, then
  // hooks over.
  g.add(mesh(ear([[-0.046, 0.09, 0.04], [-0.05, 0.12, 0.047], [-0.072, 0.2, 0.053], [-0.105, 0.28, 0.05], [-0.138, 0.35, 0.046], [-0.156, 0.39, 0.043]]), ears));
  g.add(mesh(ear([[0.046, 0.09, 0.04], [0.05, 0.12, 0.047], [0.058, 0.2, 0.053], [0.062, 0.28, 0.05], [0.055, 0.34, 0.05], [0.035, 0.378, 0.055], [0.012, 0.376, 0.063], [0.0, 0.352, 0.07]]), ears));
  hang(g);
  return g;
}

/** Hung by a cord from the crown over a peg between the ears, a little left of the middle. */
function hang(g) {
  const hole = new THREE.Vector3(-0.025, 0.225, 0);
  const out = 0.04;
  const thick = 0.0018;
  g.add(peg(hole.x, hole.y, out));
  const cord = toon('#2b2420');
  const over = new THREE.Vector3(hole.x, hole.y + PEG.radius + thick, out - 0.004);
  for (const x of [-0.04, -0.01]) g.add(rod(over, new THREE.Vector3(x, 0.128, 0.01), thick, cord));
  g.userData.hole = hole;
}

// The face ------------------------------------------------------------------

const { smoothstep, clamp } = THREE.MathUtils;
const bump = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));

/** How close (x, y) is to the segment a-b, 1 on it, falling off over `width`. */
function ridge(x, y, ax, ay, bx, by, width) {
  const dx = bx - ax;
  const dy = by - ay;
  const k = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.exp(-((Math.hypot(x - ax - k * dx, y - ay - k * dy) / width) ** 2));
}

/**
 * A ledge along a-b, like a brow: it drops off sharply below the line, so it
 * creases and inks, and slopes away gently above it.
 */
function edge(x, y, ax, ay, bx, by, below, above) {
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const along = ((x - ax) * ux + (y - ay) * uy) / len;
  const up = (y - ay) * ux - (x - ax) * uy;
  const ends = smoothstep(along, -0.2, 0.05) * (1 - smoothstep(along, 0.7, 1));
  return Math.exp(-((up / (up < 0 ? below : above)) ** 2)) * ends;
}

function halfWidth(y) {
  for (let k = 1; k < WIDTH.length; k++) {
    const [y0, w0] = WIDTH[k - 1];
    const [y1, w1] = WIDTH[k];
    if (y <= y1) return w0 + (w1 - w0) * smoothstep(y, y0, y1);
  }
  return WIDTH[WIDTH.length - 1][1];
}

/** Where the gums are along the grin, curling up towards the cheeks. */
const gumY = (x) => -0.088 + 4.5 * x * x;

/** How far each feature stands out of (or sinks into) the domed face. */
function features(x, y) {
  const ax = Math.abs(x);
  // The muzzle, pushed out round the nose and mouth: more coyote than rabbit.
  let z = 0.065 * bump(x, y, 0, -0.078, 0.062, 0.056);
  // The long, sharp bridge of the nose, and its tip with two nostrils.
  z += 0.016 * ridge(x, y, 0, 0.03, 0, -0.04, 0.0065);
  z += 0.014 * bump(x, y, 0, -0.045, 0.015, 0.013);
  z -= 0.005 * bump(ax, y, 0.008, -0.054, 0.004, 0.003);
  // Deep sockets, under a brow furrowed down into a V.
  z -= 0.036 * bump(ax, y, 0.05, -0.002, 0.038, 0.024);
  z += 0.034 * edge(ax, y, 0.006, 0.006, 0.105, 0.052, 0.005, 0.016);
  // Creases up the forehead to the ears, the Y you see on the real one.
  z += 0.01 * ridge(ax, y, 0.01, 0.04, 0.055, 0.145, 0.008);
  // Sharp cheekbones over hollow cheeks.
  z += 0.02 * edge(ax, y, 0.045, -0.03, 0.115, -0.022, 0.007, 0.02);
  z -= 0.012 * bump(ax, y, 0.075, -0.075, 0.02, 0.022);
  // The mouth: sunk where the teeth hang, a lip under them.
  const gum = gumY(x);
  const mouth = 1 - smoothstep(ax, 0.07, 0.085);
  z -= 0.009 * smoothstep(y, gum - 0.033, gum - 0.028) * (1 - smoothstep(y, gum, gum + 0.005)) * mouth;
  z += 0.009 * Math.exp(-(((y - gum + 0.04) / 0.008) ** 2)) * mouth;
  return z;
}

/** How far the face stands off the board at (x, y), given s and t across it. */
function faceZ(x, y, s, t) {
  const e = Math.sqrt(Math.max(0, 1 - s * s) * Math.max(0, 1 - t * t));
  return FACE.rim + FACE.dome * e ** 0.7 + features(x, y) * Math.min(1, e * 1.8);
}

function across(x, y) {
  return [clamp(x / halfWidth(y), -1, 1), ((y - FACE.bottom) / (FACE.top - FACE.bottom)) * 2 - 1];
}

/** The face's surface at (x, y), for setting things on it. */
const surface = (x, y) => faceZ(x, y, ...across(x, y));

/**
 * A sheet over the face, s across and t up, domed out from its rim and
 * sculpted by `features`. Spaced like angles round a ball, so the rows bunch
 * up where the rim rolls steeply back to the board.
 */
function face() {
  const NX = 64;
  const NY = 96;
  const pos = [];
  const uv = [];
  const index = [];
  const spaced = (k, n) => Math.sin((Math.PI / 2) * (-1 + (2 * k) / n));
  for (let j = 0; j <= NY; j++) {
    const t = spaced(j, NY);
    const row = FACE.bottom + ((t + 1) / 2) * (FACE.top - FACE.bottom);
    const half = halfWidth(row);
    for (let i = 0; i <= NX; i++) {
      const s = spaced(i, NX);
      const x = s * half;
      // The top rows bowed down at the sides, so the crown is round, not cut
      // square across between the ears.
      const y = row - FACE.crown * s * s * smoothstep(t, 0.4, 1);
      pos.push(x, y, faceZ(x, y, s, t));
      uv.push(...faceUV(x, y));
    }
  }
  // Each quad split along its shorter diagonal: always the same way, the
  // curved temples folded into ridges that showed as a sawtooth side on.
  const gap = (p, q) => Math.hypot(pos[p * 3] - pos[q * 3], pos[p * 3 + 1] - pos[q * 3 + 1], pos[p * 3 + 2] - pos[q * 3 + 2]);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const c = a + NX + 1;
      if (gap(a, c + 1) < gap(a + 1, c)) index.push(a, a + 1, c + 1, a, c + 1, c);
      else index.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return mesh(geo, ownToon('#ffffff', { map: faceTexture(), side: THREE.DoubleSide }));
}

const FACE_HALF = 0.12;
const faceUV = (x, y) => [(x + FACE_HALF) / (2 * FACE_HALF), (y - FACE.bottom) / (FACE.top - FACE.bottom)];

/** Flat white eyes, bulging out of their sockets under the brow. */
function eyes() {
  const g = new THREE.Group();
  const white = toon(EYE);
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(1, 24, 16), white);
    eye.scale.set(0.037, 0.023, 0.018);
    eye.rotation.z = side * -0.12;
    const x = side * 0.05;
    eye.position.set(x, -0.003, surface(x, -0.003) + 0.006);
    g.add(eye);
  }
  return g;
}

/** A dozen crooked yellow teeth hanging from the gums, longer to the sides. */
function teeth() {
  const r = rng(28);
  const n = 12;
  const parts = [];
  for (let k = 0; k < n; k++) {
    const x = -0.068 + (0.136 * (k + 0.5)) / n;
    const w = 0.0095 + r() * 0.002;
    const h = 0.022 + 0.008 * (Math.abs(x) / 0.07) + r() * 0.005;
    const geo = new THREE.ExtrudeGeometry(roundedRect(w - 0.002, h - 0.002, 0.0028), { depth: 0.005, bevelThickness: 0.0015, bevelSize: 0.001, bevelSegments: 1, curveSegments: 3 });
    // Rooted in the gum, a little crooked, turned to face out of the grin.
    geo.translate(0, -h / 2 + 0.004, -0.0025);
    geo.rotateZ((r() - 0.5) * 0.14);
    const y = gumY(x);
    const slope = (surface(x + 0.003, y - h / 2) - surface(x - 0.003, y - h / 2)) / 0.006;
    geo.rotateY(Math.atan(-slope));
    geo.translate(x, y, surface(x, y - h / 2) + 0.003);
    parts.push(geo);
  }
  return mesh(mergeGeometries(parts), toon(TOOTH));
}

/** Scuffed silver: a darker patina in the hollows, cracks, a black mouth. */
function faceTexture() {
  const W = 192;
  const H = 240;
  const { ctx, texture } = canvasTexture(W, H);
  const X = (x) => ((x + FACE_HALF) / (2 * FACE_HALF)) * W;
  const Y = (y) => ((FACE.top - y) / (FACE.top - FACE.bottom)) * H;
  const r = rng(1988);
  // Grime down in the hollows, bright where the sculpt stands proud and gets
  // rubbed: how far each point sits above or below what's round it.
  const img = ctx.createImageData(W, H);
  const step = 0.008;
  for (let py = 0; py < H; py++) {
    const y = FACE.top - ((py + 0.5) / H) * (FACE.top - FACE.bottom);
    for (let px = 0; px < W; px++) {
      const x = ((px + 0.5) / W) * 2 * FACE_HALF - FACE_HALF;
      const around = (features(x + step, y) + features(x - step, y) + features(x, y + step) + features(x, y - step)) / 4;
      const k = clamp((features(x, y) - around) / 0.005 + (r() - 0.5) * 0.2, -1, 1);
      const [to, amount] = k < 0 ? [GRIME, -k * 0.75] : [SHINE, k * 0.7];
      const i = (py * W + px) * 4;
      for (let c = 0; c < 3; c++) img.data[i + c] = METAL[c] + (to[c] - METAL[c]) * amount;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // The mouth behind the teeth.
  ctx.fillStyle = '#1c1714';
  ctx.beginPath();
  for (let x = -0.075; x <= 0.0751; x += 0.005) ctx.lineTo(X(x), Y(gumY(x) + 0.002));
  for (let x = 0.075; x >= -0.0751; x -= 0.005) ctx.lineTo(X(x), Y(gumY(x) - 0.032));
  ctx.closePath();
  ctx.fill();
  // Nostrils.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(X(side * 0.008), Y(-0.054), 2.6, 1.8, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cracks across the forehead and the chin.
  ctx.strokeStyle = 'rgba(48, 44, 40, 0.45)';
  ctx.lineWidth = 1;
  const crack = (pts) => {
    ctx.beginPath();
    for (const [x, y] of pts) ctx.lineTo(X(x) + (r() - 0.5) * 3, Y(y) + (r() - 0.5) * 3);
    ctx.stroke();
  };
  crack([[-0.06, 0.15], [-0.04, 0.12], [-0.035, 0.1], [-0.01, 0.075], [0.005, 0.06]]);
  crack([[0.03, 0.155], [0.022, 0.13], [0.03, 0.11]]);
  crack([[-0.02, -0.12], [-0.008, -0.13], [-0.012, -0.142]]);
  texture.needsUpdate = true;
  return texture;
}

// The ears --------------------------------------------------------------------

/**
 * An ear swept up a curve through `points`: lumpy, cupped in front with the
 * hollow painted darker, rounded off at the tip. Its root is buried in the
 * head, so that end is left open.
 */
function ear(points) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const N = 30;
  const M = 14;
  const outer = new THREE.Color(SILVER);
  const inner = new THREE.Color(INNER_EAR);
  const Z = new THREE.Vector3(0, 0, 1);
  const side = new THREE.Vector3();
  const front = new THREE.Vector3();
  const pos = [];
  const col = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    side.crossVectors(tangent, Z).normalize();
    front.crossVectors(side, tangent).normalize();
    // Broadest a third of the way up, knobbly, closing to a round tip.
    const tip = t > 0.8 ? Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) : 1;
    const lumps = 1 + 0.09 * Math.sin(t * 38) + 0.05 * Math.sin(t * 13 + 1);
    const w = (0.026 + 0.008 * Math.sin(Math.PI * Math.min(1, t * 1.6)) - 0.008 * t) * tip * lumps;
    const d = (0.014 - 0.005 * t) * tip;
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // In front, raised at the rims and sunk down the middle.
      const out = s > 0 ? d * s * (0.25 + 1.4 * c * c) : d * s;
      pos.push(p.x + side.x * w * c + front.x * out, p.y + side.y * w * c + front.y * out, p.z + side.z * w * c + front.z * out);
      const k = s > 0.2 && Math.abs(c) < 0.8 && t < 0.88 ? inner : outer;
      col.push(k.r, k.g, k.b);
    }
  }
  const index = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + M + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
