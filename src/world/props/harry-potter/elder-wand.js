import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, noInk, ownToon, rng, toon } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';
import { roundedRect } from '../shapes.js';
import { IRON, hookGeometry } from '../hanging.js';

// The Elder Wand (Harry Potter): Dumbledore's wand, taken from his tomb by
// Voldemort and mastered by Harry. After Pierre Bohanna's film prop and the
// Noble Collection replica: 39cm of dark, grained wood, a flared cap on the
// end of the handle, knobbly nodes down its length like clusters of
// elderberries, and a band of bone carved with runes where the handle meets
// the shaft. Two ways to show it: on a low black walnut stand topped with
// purple velvet, held in two saddles, with a brass plate on the front
// engraved with the sign of the Deathly Hallows (`mount: 'stand'`); or
// resting on two hooks out of a wall or the pegboard (`mount: 'board'`).
//
// Origin: on a stand, the bottom of the stand; on a board, the middle of its
// back. Faces +z, the handle to the right.

const WOOD = '#5b4232';
const KNOTS = '#4f3828';
const BONE = '#ebe1c8';
const WALNUT = '#271d18';
// The purple of the velvet in an Ollivanders wand box.
const VELVET = '#4e3670';
const BRASS = '#c99b45';

const LENGTH = 0.39;
// Along the wand from the end of the handle, and its radius there.
const CAP = { radius: 0.0095, neck: 0.0046, to: 0.014 };
const GRIP = 0.006;
const BAND = { from: 0.109, to: 0.133, radius: 0.0052 };
const SHAFT = { from: 0.16, root: 0.0043, tip: 0.0021 };
// The knobbly nodes: where they swell, how fat, and half how long. Two on
// the handle, the biggest midway; one just past the band; three down the
// shaft, smaller and smaller.
const NODES = [
  { at: 0.031, radius: 0.0085, half: 0.016 },
  { at: 0.083, radius: 0.01, half: 0.019 },
  { at: 0.147, radius: 0.0068, half: 0.013 },
  { at: 0.215, radius: 0.0056, half: 0.012 },
  { at: 0.277, radius: 0.0047, half: 0.01 },
  { at: 0.337, radius: 0.0037, half: 0.008 },
];

// The stand's base, the height of the wand's middle off the bench, and
// where along the wand the two saddles hold it: the grip, and the shaft
// between the last two nodes.
const BASE = { length: 0.27, depth: 0.042, height: 0.013, bevel: 0.002, corner: 0.01 };
const AXIS = 0.034;
const SADDLE = { bottom: 0.024, top: 0.017, thick: 0.008, at: [0.056, 0.307] };
// Laid with the middle between the saddles over the middle of the stand.
const MIDDLE = (SADDLE.at[0] + SADDLE.at[1]) / 2;
const PLATE = { width: 0.05, height: 0.0078 };

// On a board: two hooks in the holes 12.5cm either side of the middle,
// holding it by the grip and between the last two nodes as the saddles do,
// how far out from the board it lies on them, and their wire and shape.
const HOOKS = { at: [0.07, 0.32], wire: 0.002, out: 0.022, reach: 0.034, bend: 0.01, rise: 0.01 };

export function createElderWand({ mount = 'stand' } = {}) {
  return mount === 'board' ? onBoard() : onStand();
}

function onStand() {
  const g = new THREE.Group();
  g.add(stand());
  // Laid down along -x.
  const w = wand();
  w.position.set(MIDDLE, AXIS, 0);
  w.rotation.z = Math.PI / 2;
  g.add(w);
  return g;
}

/** Settled on its hooks: thicker at the grip, so it dips a little to the tip. */
function onBoard() {
  const g = new THREE.Group();
  // Its axis over each hook, sat on the wire, from the handle to the tip.
  const [a, b] = HOOKS.at.map((t) => new THREE.Vector2(LENGTH / 2 - t, HOOKS.wire + girth(t)));
  const along = b.clone().sub(a).normalize();
  const w = wand();
  const end = a.clone().addScaledVector(along, -HOOKS.at[0]);
  w.position.set(end.x, end.y, HOOKS.out);
  w.rotation.z = Math.atan2(-along.x, along.y);
  g.add(w);
  g.add(mesh(mergeGeometries([a, b].map((p) => hookGeometry(p.x, 0, HOOKS))), toon(IRON)));
  g.userData.hole = new THREE.Vector3(a.x, 0, 0);
  return g;
}

/** The wand, built along y from the end of the handle. */
function wand() {
  const g = new THREE.Group();
  g.add(mesh(body(), ownToon('#ffffff', { map: woodTexture() })));
  // The bone band is a sleeve of its own, so its runes get their own crisp
  // texture; the wood steps in under it.
  const band = mesh(
    new THREE.CylinderGeometry(BAND.radius, BAND.radius, BAND.to - BAND.from, 28, 1, true, -Math.PI / 2),
    ownToon('#ffffff', { map: runesTexture() }),
  );
  band.position.y = (BAND.from + BAND.to) / 2;
  g.add(band);
  return g;
}

/**
 * The wand turned on a lathe, along y from the end of the handle, the
 * knobbly parts roughed up. Its seam runs underneath.
 */
function body() {
  const pts = profile();
  const segments = 20;
  const geo = new THREE.LatheGeometry(pts, segments, -Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const noise = lumps(1998, 8, 0.004);
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const t = pos.getY(k);
    const z = pos.getZ(k);
    // Painted by how far along the wand, not by which ring of the lathe.
    uv.setY(k, THREE.MathUtils.clamp(t / LENGTH, 0, 1));
    const lump = 1 + 0.1 * knobbly(t) * noise(Math.atan2(x, z), t);
    pos.setX(k, x * lump);
    pos.setZ(k, z * lump);
  }
  geo.computeVertexNormals();
  // Matched across the seam so it doesn't show, and straight out of the ends.
  const n = geo.attributes.normal;
  const rows = pts.length;
  const v = new THREE.Vector3();
  for (let j = 0; j < rows; j++) {
    const a = j;
    const b = segments * rows + j;
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z);
    n.setXYZ(b, v.x, v.y, v.z);
  }
  for (let i = 0; i <= segments; i++) {
    n.setXYZ(i * rows, 0, -1, 0);
    n.setXYZ(i * rows + rows - 1, 0, 1, 0);
  }
  return geo;
}

/** The wand's outline as [radius, along] points, from the middle of the cap to the tip. */
function profile() {
  const pts = [];
  const add = (r, t) => pts.push(new THREE.Vector2(r, t));
  // The end of the cap, a little domed, round its rim.
  for (const [r, t] of [[0, -0.001], [0.0035, -0.0009], [0.0065, -0.0006], [0.0086, -0.0001], [0.0094, 0.0007], [CAP.radius, 0.0017]]) add(r, t);
  // Finer along the handle, where there's more going on.
  const along = [];
  for (let t = 0.0026; t < LENGTH - SHAFT.tip; t += t < SHAFT.from ? 0.002 : 0.003) {
    if (t < BAND.from - 0.001 || t > BAND.to + 0.001) along.push(t);
  }
  for (const t of along.filter((t) => t < BAND.from)) add(radius(t), t);
  // A sharp step in under the band and out again, so it's inked round.
  const inner = BAND.radius - 0.0006;
  add(radius(BAND.from), BAND.from - 0.0001);
  add(radius(BAND.from), BAND.from);
  add(inner, BAND.from);
  add(inner, BAND.to);
  add(radius(BAND.to), BAND.to);
  add(radius(BAND.to), BAND.to + 0.0001);
  for (const t of along.filter((t) => t > BAND.to)) add(radius(t), t);
  // The rounded tip.
  const end = LENGTH - SHAFT.tip;
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    add(SHAFT.tip * Math.cos(a), end + SHAFT.tip * Math.sin(a));
  }
  return pts;
}

/** How far out the wand comes `t` along it, the knobs roughed up: what holds it fits that. */
const girth = (t) => radius(t) * (1 + 0.06 * knobbly(t));

/** The wand's radius `t` along it, before the knobs are roughed up. */
function radius(t) {
  const { lerp, smoothstep } = THREE.MathUtils;
  let r;
  // The cap flares out like a trumpet's bell from a thin neck.
  if (t < CAP.to) r = CAP.neck + (CAP.radius - CAP.neck) * ((CAP.to - t) / (CAP.to - 0.0017)) ** 2;
  else if (t <= BAND.from) r = lerp(CAP.neck, GRIP, smoothstep(t, CAP.to, 0.05));
  else if (t < SHAFT.from) r = lerp(0.0056, SHAFT.root, (t - BAND.to) / (SHAFT.from - BAND.to));
  else r = lerp(SHAFT.root, SHAFT.tip, (t - SHAFT.from) / (LENGTH - SHAFT.tip - SHAFT.from));
  for (const n of NODES) {
    const u = (t - n.at) / n.half;
    if (Math.abs(u) < 1) r = smax(r, n.radius * Math.sqrt(1 - u * u), 0.0015);
  }
  return r;
}

/** How knobbly the wand is `t` along: all over the handle, and on each node past the band. */
function knobbly(t) {
  const { smoothstep } = THREE.MathUtils;
  if (t < CAP.to) return 0;
  if (t < BAND.from) return smoothstep(t, CAP.to, CAP.to + 0.004) * (1 - smoothstep(t, BAND.from - 0.004, BAND.from));
  let k = 0;
  for (const n of NODES) {
    const u = (t - n.at) / n.half;
    if (n.at > BAND.to && Math.abs(u) < 1) k = Math.max(k, 1 - u * u);
  }
  return k;
}

/** The larger of `a` and `b`, filleted where they meet. */
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/**
 * Smooth random lumps from -1 to 1, `around` to a turn (so they meet up at
 * the seam) and `step` apart along the wand.
 */
function lumps(seed, around, step) {
  const r = rng(seed);
  const rows = Math.ceil(LENGTH / step) + 2;
  const grid = Array.from({ length: rows * around }, () => r() * 2 - 1);
  const at = (i, j) => grid[j * around + (i % around)];
  const ease = (f) => f * f * (3 - 2 * f);
  return (angle, t) => {
    const u = ((((angle / (Math.PI * 2)) % 1) + 1) % 1) * around;
    const v = Math.max(0, t) / step;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = ease(u - i);
    const row = (jj) => at(i, jj) + (at(i + 1, jj) - at(i, jj)) * fu;
    return row(j) + (row(j + 1) - row(j)) * ease(v - j);
  };
}

/**
 * Round the wand across the canvas, along it up to the tip: grain down the
 * shaft, and the knobbly parts pitted all over (toon shading flattens the
 * lumps themselves, so the pits are painted on too).
 */
function woodTexture() {
  const W = 256;
  const H = 1024;
  const { ctx, texture } = canvasTexture(W, H);
  const r = rng(1881);
  const y = (t) => H * (1 - t / LENGTH);
  ctx.fillStyle = WOOD;
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = r() < 0.55 ? 'rgba(38, 24, 16, 0.32)' : 'rgba(150, 108, 78, 0.22)';
    ctx.lineWidth = 1 + r() * 3;
    let x = r() * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let k = 1; k <= 10; k++) {
      x += (r() - 0.5) * 12;
      ctx.lineTo(x, (k / 10) * H);
    }
    ctx.stroke();
  }
  // The end of the cap, worn paler.
  ctx.fillStyle = '#7a6352';
  ctx.fillRect(0, y(0.0017), W, H - y(0.0017));

  const patches = [[CAP.to - 0.001, BAND.from], ...NODES.filter((n) => n.at > BAND.to).map((n) => [n.at - n.half * 0.92, n.at + n.half * 0.92])];
  for (const [from, to] of patches) {
    ctx.fillStyle = KNOTS;
    ctx.fillRect(0, y(to), W, y(from) - y(to));
    // About one pit to every 3 square millimetres, each with the ridge
    // beside it catching the light, as on the replica.
    const area = (to - from) * 2 * Math.PI * radius((from + to) / 2) * 1e6;
    for (let i = 0; i < area / 3; i++) {
      const t = from + r() * (to - from);
      const x = r() * W;
      const size = 0.0005 + r() * 0.0006;
      const rx = (size / (2 * Math.PI * radius(t))) * W;
      const ry = (size / LENGTH) * H;
      for (const dx of [-W, 0, W]) {
        ctx.fillStyle = 'rgba(128, 98, 74, 0.7)';
        ellipse(ctx, x + dx + rx * 0.35, y(t) - ry * 0.35, rx * 1.2, ry * 1.2);
        ctx.fillStyle = '#23160e';
        ellipse(ctx, x + dx, y(t), rx, ry);
      }
    }
  }
  texture.needsUpdate = true;
  return texture;
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Runes as strokes in a unit square, y down.
const RUNES = [
  [[[0.5, 0], [0.5, 1]], [[0.5, 0.45], [0.08, 0.05]], [[0.5, 0.45], [0.92, 0.05]]],
  [[[0.15, 1], [0.15, 0], [0.85, 1], [0.85, 0]]],
  [[[0.1, 0], [0.9, 0], [0.1, 1], [0.9, 1]]],
  [[[0.5, 0], [0.5, 1]], [[0.12, 0.2], [0.88, 0.8]], [[0.88, 0.2], [0.12, 0.8]]],
  [[[0.2, 0], [0.2, 1]], [[0.5, 0], [0.5, 1]], [[0.8, 0], [0.8, 1]]],
  [[[0.1, 0], [0.1, 1], [0.9, 0], [0.9, 1], [0.1, 0]]],
  [[[0.3, 0], [0.3, 1]], [[0.3, 0.2], [0.8, 0.45], [0.3, 0.7]]],
  [[[0.5, 1], [0.5, 0.35]], [[0.12, 0.7], [0.5, 0], [0.88, 0.7]]],
];

/** The bone sleeve: aged ivory, inked at its edges, with three rows of runes round it. */
function runesTexture() {
  const W = 256;
  // Square pixels on the sleeve: its length over its girth.
  const H = Math.round((W * (BAND.to - BAND.from)) / (2 * Math.PI * BAND.radius));
  const { ctx, texture } = canvasTexture(W, H);
  const r = rng(7);
  ctx.fillStyle = BONE;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(150, 130, 90, ${0.08 + r() * 0.12})`;
    ctx.fillRect(r() * W, 0, 2 + r() * 8, H);
  }
  ctx.fillStyle = '#3a2c20';
  ctx.fillRect(0, 0, W, 4);
  ctx.fillRect(0, H - 4, W, 4);
  // Up the runes is round the sleeve, so they stand upright with the wand
  // lying down, and read along it from the tip to the handle.
  ctx.strokeStyle = '#1e1712';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const per = 4;
  const tall = 34;
  const wide = 20;
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < per; k++) {
      const strokes = RUNES[(row * per + k) % RUNES.length];
      ctx.save();
      // One row on the front, where the sleeve faces you lying down.
      ctx.translate(W * (0.25 + row / 3) + tall / 2, ((k + 0.5) * H) / per - wide / 2);
      ctx.rotate(Math.PI / 2);
      for (const line of strokes) {
        ctx.beginPath();
        line.forEach(([px, py]) => ctx.lineTo(px * wide, py * tall));
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  texture.needsUpdate = true;
  return texture;
}

function stand() {
  const g = new THREE.Group();
  const { length, depth, height, bevel, corner } = BASE;
  const base = new THREE.ExtrudeGeometry(roundedRect(length - bevel * 2, depth - bevel * 2, corner), {
    depth: height - bevel * 2,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  base.rotateX(-Math.PI / 2);
  base.translate(0, bevel, 0);
  // Each saddle fits the wand where it holds it, knobs and all.
  const saddles = SADDLE.at.map((t) => saddle(girth(t)).translate(MIDDLE - t, 0, 0));
  g.add(mesh(mergeGeometries([base, ...saddles]), toon(WALNUT)));
  // Velvet on top, so the dark wand stands out against it from above.
  const inset = 0.005;
  const velvet = mesh(new THREE.ShapeGeometry(roundedRect(length - inset * 2, depth - inset * 2, corner - inset), 6), toon(VELVET), { cast: false });
  velvet.rotation.x = -Math.PI / 2;
  velvet.position.y = height + 0.0003;
  g.add(noInk(velvet));

  // The brass plate on the front, and what's engraved on it.
  const { width: pw, height: ph } = PLATE;
  const plateGeo = new THREE.ExtrudeGeometry(roundedRect(pw, ph, 0.0015), { depth: 0.0006, bevelEnabled: false, curveSegments: 4 });
  const plate = mesh(plateGeo, toon(BRASS), { cast: false });
  plate.position.set(0, height / 2, depth / 2);
  g.add(plate);
  const engraving = mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: hallowsTexture(pw, ph), transparent: true, depthWrite: false }), { cast: false });
  engraving.position.set(0, height / 2, depth / 2 + 0.0008);
  g.add(noInk(engraving));
  return g;
}

/** A block standing on the base with a round notch in its top the wand lies in, `radius` round. */
function saddle(radius) {
  const bevel = 0.001;
  // The bevel grows the shape all round, so it's drawn that much smaller.
  const bottom = SADDLE.bottom / 2 - bevel;
  const top = SADDLE.top / 2 - bevel;
  const notch = radius + 0.0004 + bevel;
  const s = new THREE.Shape();
  s.moveTo(-bottom, BASE.height - 0.0005 + bevel);
  s.lineTo(bottom, BASE.height - 0.0005 + bevel);
  s.lineTo(top, AXIS - bevel);
  s.lineTo(notch, AXIS - bevel);
  s.absarc(0, AXIS, notch, 0, Math.PI, true);
  s.lineTo(-top, AXIS - bevel);
  s.closePath();
  const depth = SADDLE.thick - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 12 });
  // Stood across the wand: the extrusion runs along it, x.
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** "ELDER WAND" either side of the sign of the Hallows: the cloak, the stone and the wand. */
function hallowsTexture(width, height) {
  const H = 64;
  const W = Math.round((H * width) / height);
  const { ctx, texture } = canvasTexture(W, H);
  const ink = '#4a3410';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = 'round';
  const c = W / 2;
  const top = 9;
  const bottom = H - 9;
  const tall = bottom - top;
  const half = tall / Math.sqrt(3);
  ctx.beginPath();
  ctx.moveTo(c, top);
  ctx.lineTo(c + half, bottom);
  ctx.lineTo(c - half, bottom);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, bottom - tall / 3, tall / 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c, top);
  ctx.lineTo(c, bottom);
  ctx.stroke();
  ctx.font = '700 28px Georgia, "Times New Roman", serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText('ELDER', c - half - 14, H / 2 + 2);
  ctx.textAlign = 'left';
  ctx.fillText('WAND', c + half + 14, H / 2 + 2);
  texture.needsUpdate = true;
  return texture;
}
