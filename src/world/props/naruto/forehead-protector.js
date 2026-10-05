import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, ownToon, rng, toon } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';
import { peg } from '../hanging.js';

// The Konoha forehead protector (Naruto): the hitai-ate a Hidden Leaf ninja
// gets on leaving the Academy. A steel plate with rounded corners, curved to
// sit on a forehead and riveted three a side onto a navy cloth band a little
// taller than it, with the Leaf cut into it: a spiral that runs out into a
// stem at the top right, with a sharp point off the bottom left. Modelled on
// Naruto's own (blue band, as in the first series) and ABYstyle's licensed
// replica, a 12.5 by 4cm plate on a band 5cm wide and 90cm long. Still tied,
// it hangs by its knot from a peg: the loop drops to the plate, and the
// tails stick out of the knot and droop.
//
// Origin: the middle of its back, on the board. Faces +z.

const STEEL = '#c4cddf';
const CLOTH = '#2f4a86';
const PLATE = { w: 0.125, h: 0.04, r: 0.009, thick: 0.0025, bow: 0.009 };
const BAND = { w: 0.05, thick: 0.002 };
// The peg is this far above the origin, the middle of the plate as far below.
const PEG = 0.105;
const Z = new THREE.Vector3(0, 0, 1);

export function createForeheadProtector() {
  const g = new THREE.Group();
  g.add(peg(0, PEG, 0.034));
  g.add(mesh(mergeGeometries([loop(), ...tails(), ...knot()]), toon(CLOTH)));
  g.add(mesh(plateGeometry(), ownToon('#ffffff', { map: plateTexture() })));
  g.add(mesh(rivets(), toon('#8f98a4')));
  g.userData.hole = new THREE.Vector3(0, PEG, 0);
  return g;
}

/** How far the plate stands off its ends at `x`: it's curved to fit a head. */
const bow = (x) => PLATE.bow * Math.max(0, 1 - (x / (PLATE.w / 2)) ** 2);
/** Where the front of the plate is at `x`: on the band, which is on the board. */
const plateFront = (x) => BAND.thick + bow(x) + PLATE.thick;

// The cloth ---------------------------------------------------------------

/**
 * The band, tied in a loop: up from the knot, down to the plate, behind it
 * and back up. Flat and full width only where the plate holds it; it bunches
 * where it turns off the plate's ends, and gathers and turns as it nears the
 * peg, the way cloth does going over one.
 */
function loop() {
  const y = -PEG;
  const half = PLATE.w / 2;
  const behind = (x) => BAND.thick / 2 + bow(x);
  // From the knot down to the plate's right end, and in behind it.
  const right = [
    [0.016, PEG + 0.004, 0.014],
    [0.03, PEG - 0.04, 0.012],
    [half - 0.006, y + 0.075, 0.007],
    [half + 0.013, y + 0.032, 0.004],
    [half + 0.019, y + 0.01, 0.0025],
    [half + 0.012, y - 0.002, 0.0015],
    [half - 0.004, y, behind(half - 0.004)],
    [half - 0.024, y, behind(half - 0.024)],
  ].map(([px, py, pz]) => new THREE.Vector3(px, py, pz));
  const left = right.map((p) => new THREE.Vector3(-p.x, p.y, p.z));
  const points = [...left, new THREE.Vector3(0, y, behind(0)), ...right.reverse()];
  const off = (p) => Math.max(THREE.MathUtils.smoothstep(Math.abs(p.x), half - 0.008, half + 0.006), THREE.MathUtils.smoothstep(p.y, y + 0.01, y + 0.03));
  const rise = (p) => THREE.MathUtils.smoothstep(p.y, y + 0.03, PEG);
  return ribbon(points, 160, (p) => BAND.w * (1 - 0.35 * off(p)) * (1 - 0.3 * rise(p)), (p, t) => {
    // Turning outwards about its length, up to the peg.
    const out = new THREE.Vector3().crossVectors(t, Z).normalize();
    if (out.x * p.x < 0) out.negate();
    const turn = 0.9 * THREE.MathUtils.smoothstep(p.y, y + 0.06, PEG);
    return Z.clone().multiplyScalar(Math.cos(turn)).addScaledVector(out, Math.sin(turn));
  });
}

/**
 * The two tied ends. A square knot sends them out sideways, so they stick
 * out over the top of the loop and droop down outside it, one longer.
 */
function tails() {
  const v = (list) => list.map(([x, y, z]) => new THREE.Vector3(x, PEG + y, z));
  const left = v([[-0.004, 0.013, 0.02], [-0.03, 0.012, 0.027], [-0.052, 0.001, 0.023], [-0.068, -0.025, 0.017], [-0.078, -0.064, 0.013], [-0.085, -0.1, 0.011], [-0.089, -0.128, 0.01]]);
  const right = v([[0.004, 0.011, 0.02], [0.03, 0.009, 0.027], [0.051, -0.003, 0.023], [0.066, -0.03, 0.017], [0.075, -0.07, 0.013], [0.081, -0.112, 0.011]]);
  // Gathered where they leave the knot, opening out to the cut ends.
  const wide = (p, s) => THREE.MathUtils.lerp(0.015, 0.04, s ** 0.5);
  return [
    ribbon(left, 44, wide, (p, t, s) => Z.clone().applyAxisAngle(t, -0.35 * s)),
    ribbon(right, 40, wide, (p, t, s) => Z.clone().applyAxisAngle(t, 0.4 * s)),
  ];
}

/** The knot on top of the peg: a lump of cloth with the band crossing it. */
function knot() {
  const centre = new THREE.Vector3(0, PEG + 0.012, 0.017);
  const core = new THREE.SphereGeometry(1, 14, 10);
  core.scale(0.022, 0.016, 0.014);
  core.translate(centre.x, centre.y, centre.z);
  core.deleteAttribute('uv');
  // The crossing end, a little tilted, tucked in at both sides.
  const tilt = new THREE.Quaternion().setFromAxisAngle(Z, 0.2);
  const wrap = [];
  for (let k = 0; k <= 8; k++) {
    const a = -1.5 + (3 * k) / 8;
    const tuck = 0.86 + 0.18 * Math.cos(a);
    wrap.push(new THREE.Vector3(Math.sin(a) * 0.0215 * tuck, 0, Math.cos(a) * 0.0138 * tuck).applyQuaternion(tilt).add(centre));
  }
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt);
  // Full across the front, narrowing round the sides to hug the lump.
  const wide = (p, s) => 0.018 * (0.35 + 0.65 * Math.sin(Math.PI * s) ** 0.8);
  const band = ribbon(wrap, 24, wide, (p) => p.clone().sub(centre).projectOnPlane(up));
  return [core.toNonIndexed(), band];
}

/**
 * A strip of cloth `thick` deep along a smooth curve through `points`:
 * `wide(p, s)` across, its face towards `face(p, tangent, s)`, s from 0 to 1
 * along it. Solid, ends and all, so the ink lines find its edges.
 */
function ribbon(points, n, wide, face, thick = BAND.thick) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const rings = [];
  const centres = [];
  for (let k = 0; k <= n; k++) {
    const s = k / n;
    const p = curve.getPointAt(s);
    const t = curve.getTangentAt(s);
    const f = face(p, t, s).projectOnPlane(t).normalize();
    const a = new THREE.Vector3().crossVectors(t, f);
    const w = wide(p, s) / 2;
    const corner = (sa, sf) => p.clone().addScaledVector(a, sa * w).addScaledVector(f, (sf * thick) / 2);
    rings.push([corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)]);
    centres.push(p);
  }
  const parts = [];
  // Each side smooth along its length, creased at the edges.
  for (let side = 0; side < 4; side++) parts.push(strip(rings.map((r) => r[side]), rings.map((r) => r[(side + 1) % 4]), centres));
  parts.push(cap(rings[0], centres[0].clone().sub(centres[1])), cap(rings[n], centres[n].clone().sub(centres[n - 1])));
  return mergeGeometries(parts);
}

/** Quads between two rows of points, wound to face away from `centres`. */
function strip(a, b, centres) {
  const n = a.length;
  const geo = new THREE.BufferGeometry().setFromPoints([...a, ...b]);
  const index = [];
  for (let k = 0; k < n - 1; k++) index.push(k, k + 1, n + k + 1, k, n + k + 1, n + k);
  const normal = new THREE.Vector3().crossVectors(a[1].clone().sub(a[0]), b[1].clone().sub(a[0]));
  const out = a[0].clone().add(b[0]).multiplyScalar(0.5).sub(centres[0]);
  if (normal.dot(out) < 0) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}

/** A flat end over four corners, facing `out`. */
function cap([p, q, r, s], out) {
  const normal = new THREE.Vector3().crossVectors(q.clone().sub(p), r.clone().sub(p));
  const tris = normal.dot(out) > 0 ? [p, q, r, p, r, s] : [p, r, q, p, s, r];
  const geo = new THREE.BufferGeometry().setFromPoints(tris);
  geo.computeVertexNormals();
  return geo;
}

// The plate ---------------------------------------------------------------

/**
 * The plate: a slab with rounded corners on a grid, so it can bow. Columns
 * bunch round the corners to keep them round. The front carries the Leaf;
 * the back and edges take the plain steel from the texture's margin.
 */
function plateGeometry() {
  const { w, h, r, thick } = PLATE;
  const y0 = -PEG;
  const xs = [];
  const C = 5;
  const M = 18;
  for (let i = C; i > 0; i--) xs.push(-(w / 2 - r) - r * Math.sin(((i / C) * Math.PI) / 2));
  for (let i = 0; i <= M; i++) xs.push(-(w / 2 - r) + ((w - 2 * r) * i) / M);
  for (let i = 1; i <= C; i++) xs.push(w / 2 - r + r * Math.sin(((i / C) * Math.PI) / 2));
  const top = (x) => h / 2 - r + Math.sqrt(Math.max(0, r * r - Math.max(0, Math.abs(x) - (w / 2 - r)) ** 2));
  const nx = xs.length - 1;
  const ny = 4;
  const point = (i, j, back) => {
    const x = xs[i];
    return new THREE.Vector3(x, y0 + top(x) * ((2 * j) / ny - 1), plateFront(x) - back * thick);
  };

  // The front, smooth across its bow.
  const pts = [];
  const uvs = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const p = point(i, j, 0);
      pts.push(p.x, p.y, p.z);
      uvs.push((p.x + w / 2) / w, (p.y - y0 + h / 2) / h);
    }
  }
  const index = [];
  const at = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) index.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
  const front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  front.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  front.setIndex(index);
  front.computeVertexNormals();

  // The back, and the edge all round, wound to face out.
  const plain = [];
  const tri = (...ps) => plain.push(...ps);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [a, b, c, d] = [point(i, j, 1), point(i + 1, j, 1), point(i + 1, j + 1, 1), point(i, j + 1, 1)];
      tri(a, c, b, a, d, c);
    }
  }
  const rim = [];
  for (let i = 0; i < nx; i++) rim.push([i, 0]);
  for (let j = 0; j < ny; j++) rim.push([nx, j]);
  for (let i = nx; i > 0; i--) rim.push([i, ny]);
  for (let j = ny; j > 0; j--) rim.push([0, j]);
  rim.forEach((p, k) => {
    const q = rim[(k + 1) % rim.length];
    const [fp, fq, bp, bq] = [point(...p, 0), point(...q, 0), point(...p, 1), point(...q, 1)];
    tri(fq, fp, bq, fp, bp, bq);
  });
  const rest = new THREE.BufferGeometry().setFromPoints(plain);
  rest.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(plain.length * 2).fill(0.01), 2));
  rest.computeVertexNormals();
  return mergeGeometries([front.toNonIndexed(), rest]);
}

/** Six domed rivets, three down each end, holding the plate to the band. */
function rivets() {
  const heads = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 0, 1]) {
      const x = sx * (PLATE.w / 2 - 0.0065);
      const head = new THREE.SphereGeometry(0.0024, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      head.rotateX(Math.PI / 2);
      head.scale(1, 1, 0.6);
      head.translate(x, -PEG + sy * 0.014, plateFront(x) - 0.0003);
      heads.push(head);
    }
  }
  return mergeGeometries(heads);
}

/** Brushed steel with the Leaf cut in, the groove's lower lip catching the light. */
function plateTexture() {
  const W = 512;
  const H = Math.round((W * PLATE.h) / PLATE.w);
  const { ctx, texture } = canvasTexture(W, H);
  const r = rng(1999);
  ctx.fillStyle = STEEL;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 36; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255, 255, 255, 0.1)' : 'rgba(60, 70, 84, 0.05)';
    ctx.fillRect(0, r() * H, W, 1 + r() * 2);
  }
  // About two thirds of the plate tall, as on the replica, its outline
  // (3.2 by 2.5 ring radii, stroke and all) centred.
  const unit = (H * 0.68) / 2.5;
  ctx.save();
  ctx.translate(W / 2 - 0.055 * unit, H / 2 + 0.16 * unit);
  ctx.scale(unit, unit);
  ctx.lineWidth = 0.16;
  ctx.strokeStyle = '#f1f4f7';
  leaf(ctx, 0.06);
  ctx.strokeStyle = '#47505b';
  leaf(ctx, 0);
  ctx.restore();
  texture.needsUpdate = true;
  return texture;
}

// The Leaf, round an outer ring of radius 1, in canvas units (y down) -----

/** The spiral's radius `a` radians round from its inner end, clockwise. */
function spiral(a) {
  // A tight curl that hooks in at its end, then opens out over the top into
  // the outer ring, which runs nearly all the way round. Slowly enough at
  // first that the line never bends back on itself.
  const curl = 0.3 + 0.13 * (1 - Math.exp(-a / 0.3));
  const out = THREE.MathUtils.smootherstep(a, 4.2, 6.9);
  // Over the top the ring swells out to where the stem leaves, as on the
  // symbol, rather than closing up round.
  const swell = Math.max(0, (a - TURN - 4.4) / (END - TURN - 4.4));
  return THREE.MathUtils.lerp(curl, 1, out) + 0.27 * swell ** 1.6;
}
const onSpiral = (a) => [spiral(a) * Math.cos(a), spiral(a) * Math.sin(a)];
const TURN = 2 * Math.PI;
// Where the ring leaves as the stem (upper right), how long that runs up and
// out, and the point's sharp tip, level with the bottom of the ring.
const END = TURN + 5.65;
const STEM = 0.8;
const TIP = [-1.48, 1];

/** Strokes the Leaf `drop` lower than where it sits. */
function leaf(ctx, drop) {
  ctx.save();
  ctx.translate(0, drop);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let a = 0; a < END; a += 0.04) ctx.lineTo(...onSpiral(a));
  const [ex, ey] = onSpiral(END);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ex + STEM * Math.SQRT1_2, ey - STEM * Math.SQRT1_2);
  ctx.stroke();
  // The point: straight down off the upper left of the ring to the tip, and
  // straight back along the bottom, leaving a triangle between.
  const [fx, fy] = onSpiral(TURN + 3.52);
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(...TIP);
  ctx.lineTo(0, TIP[1]);
  ctx.stroke();
  ctx.restore();
}
