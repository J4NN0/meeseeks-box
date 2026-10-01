import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cyl, mesh, ownToon, rng, sphere, toon } from '../../engine/toon.js';
import { canvasTexture, fit } from '../screens.js';
import { roundedRect } from '../props/shapes.js';

// The rest of the Smiths' living room, as it is in the show: the coffee
// table, the end table with the amber lamp, the bookshelf, the dresser with
// the fruit bowl, the vase of yellow blossom and the mirror over it, the
// olive rug and the pictures on the walls.
//
// Floor pieces: origin on the floor in the middle, facing +z. Wall pieces:
// origin in the middle of the back, facing out from the wall (+z).

const WOOD = '#a8693e';
const WOOD_DARK = '#6e4a30';

export const COFFEE_TABLE = { width: 1.2, depth: 0.6, height: 0.44 };

export function createCoffeeTable() {
  const g = new THREE.Group();
  const { width: W, depth: D, height: H } = COFFEE_TABLE;
  g.add(box(W, 0.05, D, WOOD, 0, H - 0.025, 0));
  g.add(box(1.08, 0.07, 0.5, '#7b4a2b', 0, H - 0.085, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, H - 0.05, 0.05, '#7b4a2b', sx * 0.52, (H - 0.05) / 2, sz * 0.22));
  return g;
}

/** A small dark end table with a shelf underneath, `item` stood on top. */
export function createEndTable(item) {
  const g = new THREE.Group();
  const H = 0.58;
  g.add(box(0.5, 0.04, 0.5, WOOD_DARK, 0, H - 0.02, 0));
  g.add(box(0.44, 0.025, 0.44, WOOD_DARK, 0, 0.16, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, H - 0.04, 0.04, WOOD_DARK, sx * 0.21, (H - 0.04) / 2, sz * 0.21));
  if (item) {
    item.position.y = H;
    g.add(item);
  }
  return g;
}

/** The table lamp by the couch: a round amber base and a cream drum shade, lit. */
export function createLamp() {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.06, 0], [0.08, 0.04], [0.088, 0.1], [0.07, 0.16], [0.035, 0.2], [0.018, 0.23], [0, 0.23]]), toon('#d98b3a')));
  g.add(cyl(0.008, 0.008, 0.16, '#c9a14a', 8).translateY(0.3));
  const shade = mesh(new THREE.CylinderGeometry(0.13, 0.165, 0.22, 32, 1, true), toon('#f5eed5', { side: THREE.DoubleSide, emissive: '#4a3f22' }));
  shade.position.y = 0.43;
  g.add(shade);
  return g;
}

/** A blue vase of yellow blossom on bare branches (forsythia). */
export function createFlowers() {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.05, 0], [0.075, 0.06], [0.07, 0.14], [0.035, 0.2], [0.03, 0.24], [0.04, 0.26], [0, 0.26]]), toon('#5b86c4')));
  const r = rng(5);
  const stems = [];
  const blossom = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.5;
    const lean = 0.2 + r() * 0.35;
    const len = 0.28 + r() * 0.2;
    const dir = new THREE.Vector3(Math.sin(a) * Math.sin(lean), Math.cos(lean), Math.cos(a) * Math.sin(lean));
    const from = new THREE.Vector3(0, 0.24, 0);
    const stem = new THREE.CylinderGeometry(0.0035, 0.005, len, 5);
    stem.translate(0, len / 2, 0);
    stem.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    stem.translate(from.x, from.y, from.z);
    stems.push(stem);
    for (let k = 0; k < 7; k++) {
      const p = from.clone().addScaledVector(dir, len * (0.35 + (k / 6) * 0.65));
      const bud = new THREE.IcosahedronGeometry(0.012 + r() * 0.008, 0);
      bud.translate(p.x + (r() - 0.5) * 0.03, p.y + (r() - 0.5) * 0.02, p.z + (r() - 0.5) * 0.03);
      blossom.push(bud);
    }
  }
  g.add(mesh(merge(stems), toon('#6b4a30')));
  g.add(mesh(merge(blossom), toon('#f2cf3a')));
  return g;
}

/**
 * The dark bookshelf, five shelves of well-read books: hardbacks and
 * paperbacks, the odd matching set, a pile lying flat, one leaning at the
 * end of a row.
 */
export function createBookshelf() {
  const g = new THREE.Group();
  const W = 1.55;
  const D = 0.35;
  const H = 2.15;
  const ROWS = 5;
  const wood = toon('#70543a');
  for (const s of [-1, 1]) g.add(box(0.04, H - 0.04, D, wood, s * (W / 2 - 0.02), (H - 0.04) / 2, 0));
  g.add(box(W, 0.04, D, wood, 0, H - 0.02, 0));
  g.add(box(W - 0.08, 0.08, D, wood, 0, 0.04, 0));
  g.add(box(W - 0.08, H - 0.12, 0.02, '#4f3a27', 0, H / 2 - 0.02, -D / 2 + 0.01));
  // From the top of the plinth to the underside of the top, evenly.
  const shelves = Array.from({ length: ROWS + 1 }, (_, i) => 0.08 + (i * (H - 0.12)) / ROWS);
  for (const y of shelves.slice(1, -1)) g.add(box(W - 0.08, 0.03, D - 0.02, wood, 0, y, 0));

  const r = rng(11);
  const books = [];
  // Spines flush at the front.
  const front = D / 2 - 0.025;
  const left = -W / 2 + 0.045;
  const right = W / 2 - 0.045;
  for (let row = 0; row < ROWS; row++) {
    const floor = shelves[row] + (row ? 0.015 : 0);
    const room = shelves[row + 1] - floor - (row === ROWS - 1 ? 0 : 0.015);
    // Most rows stop short, for a book leaning at the end.
    const end = right - (r() < 0.7 ? 0.07 + r() * 0.06 : 0);
    let x = left;
    let last = 0;
    while (x < end - 0.016) {
      const roll = r();
      if (roll < 0.07 && x + 0.25 < end) {
        // A pile lying flat, the biggest at the bottom.
        let y = floor;
        for (let k = 0, n = 2 + Math.floor(r() * 3); k < n && y < floor + room - 0.08; k++) {
          const t = 0.025 + r() * 0.02;
          const len = 0.23 - k * 0.015 - r() * 0.02;
          const d = 0.2 - k * 0.01;
          const b = book(len, t, d, Math.floor(r() * SPINES.count), true);
          b.rotateY((r() - 0.5) * 0.08).translate(x + 0.125, y + t / 2, front - d / 2);
          books.push(b);
          y += t;
        }
        x += 0.25;
        last = y - floor;
        continue;
      }
      // Paperbacks are short and thin; hardbacks come in sets now and then.
      const paperback = roll < 0.4;
      const set = roll > 0.9 ? 3 + Math.floor(r() * 3) : 1;
      const design = Math.floor(r() * SPINES.count);
      const w = paperback ? 0.016 + r() * 0.014 : 0.026 + r() * 0.026;
      const h = Math.min(room - 0.03, paperback ? 0.18 + r() * 0.03 : 0.22 + r() * 0.1);
      const d = paperback ? 0.13 + r() * 0.03 : 0.19 + r() * 0.05;
      for (let k = 0; k < set && x + w <= end; k++) {
        books.push(book(w, h, d, design).translate(x + w / 2, floor + h / 2, front - d / 2));
        x += w;
        last = h;
      }
    }
    // Leaning on the last one, its foot out on the shelf.
    const a = 0.3 + r() * 0.15;
    const w = 0.028;
    const h = Math.min(0.26, (room - 0.02 - w * Math.sin(a)) / Math.cos(a));
    const foot = x + Math.min(h * Math.cos(a), last) * Math.tan(a);
    if (foot + w * Math.cos(a) < right) {
      const b = book(w, h, 0.2, Math.floor(r() * SPINES.count));
      b.translate(w / 2, h / 2, 0).rotateZ(a).translate(foot, floor, front - 0.1);
      books.push(b);
    }
  }
  g.add(mesh(merge(books), ownToon('#ffffff', { map: spineAtlas() })));
  return g;
}

// The book covers, a column each in one texture: the spine on top, then a
// patch of the cover's colour for its sides, then its pages seen end on.
const SPINES = { count: 32, w: 32, h: 256, patch: 32 };
const COVERS = [
  '#8fa58a', '#b9b38f', '#7f6a55', '#3f4f6b', '#8c4f45', '#c9c2a3', '#5f7356', '#6b2f2f',
  '#c8a24a', '#6d7f8a', '#a2875f', '#2f3a33', '#a85a3c', '#d6cfb5', '#b7a67a', '#4d4058',
];
const TITLES = [
  'Plumbus', 'Get Schwifty', 'Squanch', 'Wubba Lubba', 'Anatomy Park', 'Blips & Chitz', 'Gazorpazorp', 'The Citadel',
  'Froopyland', 'Microverse', 'Cronenberg', 'Unity', 'Szechuan', 'Tiny Rick', 'Meeseeks', 'Birdperson',
  'Scary Terry', 'Glip Glop', 'Krombopulos', 'Gromflomite', 'Jerryboree', 'Purge', 'Mr. Goldenfold', 'Ball Fondlers',
  'Abradolf', 'Squanchy', 'Shleemypants', 'Gearhead', 'Noob-Noob', 'Snuffles', 'Jaguar', 'Kirkland',
];

/**
 * A book `w` wide, `h` tall and `d` deep, centred on 0, its faces mapped to
 * cover `design` in the atlas. `flat` books lie on their side, spine out.
 */
function book(w, h, d, design, flat = false) {
  const b = new THREE.BoxGeometry(w, h, d);
  const { count, h: spine, patch } = SPINES;
  const total = spine + patch * 2;
  const u0 = (design + 0.06) / count;
  const u1 = (design + 0.94) / count;
  const region = (top, bottom) => [u0, 1 - bottom / total, u1, 1 - top / total];
  const cover = region(spine + 4, spine + patch - 4);
  const pages = region(spine + patch + 2, total - 2);
  // Faces: +x, -x, +y, -y, +z (the spine), -z.
  const faces = flat
    ? [[pages, true], [pages, true], [cover], [cover], [region(2, spine - 2), true], [pages]]
    : [[cover], [cover], [pages], [pages], [region(0, spine)], [pages]];
  const uv = b.attributes.uv;
  faces.forEach(([[a0, b0, a1, b1], turn], f) => {
    for (let i = f * 4; i < f * 4 + 4; i++) {
      let u = uv.getX(i);
      let v = uv.getY(i);
      if (turn) [u, v] = [v, 1 - u];
      uv.setXY(i, a0 + u * (a1 - a0), b0 + v * (b1 - b0));
    }
  });
  return b;
}

/** Spines in five styles (gilt bands, a title panel, a paper label, cloth, a paperback), titles down them. */
function spineAtlas() {
  const { count, w, h: H, patch } = SPINES;
  const { ctx, texture } = canvasTexture(count * w, H + patch * 2);
  const GOLD = '#d8bf72';
  const CREAM = '#efe6cc';
  const DARK = '#2a2522';
  const title = (text, x, y0, y1, color, size = 14) => {
    ctx.save();
    ctx.translate(x + w / 2, (y0 + y1) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(fit(ctx, text, y1 - y0), 0, 1);
    ctx.restore();
  };
  const band = (x, y, height, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, height);
  };
  for (let c = 0; c < count; c++) {
    const x = c * w;
    const color = COVERS[(c * 5) % COVERS.length];
    const dark = new THREE.Color(color).multiplyScalar(0.62).getStyle();
    const { r, g, b } = new THREE.Color(color);
    const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2;
    const ink = light ? DARK : CREAM;
    band(x, 0, H + patch, color);
    const name = TITLES[c % TITLES.length];
    switch (c % 5) {
      case 0: // Hardback: gilt bands top and bottom, gilt title on a dark panel.
        for (const y of [10, 17, H - 21, H - 14]) band(x, y, 3, GOLD);
        ctx.fillStyle = dark;
        ctx.fillRect(x + 3, 30, w - 6, 120);
        title(name, x, 34, 146, GOLD, 13);
        ctx.fillStyle = GOLD;
        ctx.beginPath();
        ctx.arc(x + w / 2, H - 46, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 1: // Paperback: a block of colour at the top, the publisher's mark at the foot.
        band(x, 0, 58, COVERS[(c * 5 + 3) % COVERS.length]);
        title(name, x, 66, 214, ink, 14);
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(x + w / 2, H - 22, 6, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 2: // A paper label with the title, a dark band near the foot.
        ctx.fillStyle = CREAM;
        ctx.fillRect(x + 4, 26, w - 8, 120);
        title(name, x, 30, 142, DARK, 12);
        band(x, H - 44, 14, dark);
        break;
      case 3: // Cloth: rules round the head and tail, the title between.
        for (const y of [8, 14, 20, H - 24, H - 18, H - 12]) band(x, y, 2, dark);
        title(name, x, 40, 200, ink, 14);
        break;
      default: // Modern: a wide stripe across the middle, title through it.
        band(x, 90, 70, dark);
        band(x, 86, 3, GOLD);
        band(x, 161, 3, GOLD);
        title(name, x, 30, 226, CREAM, 13);
        break;
    }
    // Wear along the spine's edges.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(x, 0, 2, H);
    ctx.fillRect(x + w - 2, 0, 2, H);
    // Its pages, end on: the covers either side, a block of paper between.
    const py = H + patch;
    band(x, py, patch, color);
    ctx.fillStyle = CREAM;
    ctx.fillRect(x + 4, py, w - 8, patch);
    ctx.fillStyle = '#d9cfb2';
    for (let k = x + 6; k < x + w - 5; k += 3) ctx.fillRect(k, py, 1, patch);
  }
  texture.needsUpdate = true;
  return texture;
}

/** The dark dresser: a bowl of fruit on it, `item` at its other end. */
export function createDresser(item) {
  const g = new THREE.Group();
  const W = 1.0;
  const H = 0.8;
  const D = 0.45;
  // The body stops under the top, so their faces don't fight.
  g.add(box(W, H - 0.09, D, WOOD_DARK, 0, (H - 0.09) / 2 + 0.06, 0));
  g.add(box(W + 0.03, 0.03, D + 0.02, '#5c3d27', 0, H - 0.015, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, 0.06, 0.05, '#5c3d27', sx * (W / 2 - 0.05), 0.03, sz * (D / 2 - 0.05)));
  // Three drawers, each with two knobs.
  for (let i = 0; i < 3; i++) {
    const y = 0.2 + i * 0.2;
    g.add(box(W - 0.08, 0.17, 0.015, '#7d553a', 0, y, D / 2 + 0.006));
    for (const s of [-1, 1]) g.add(sphere(0.014, '#c9a14a', 8).translateX(s * 0.25).translateY(y).translateZ(D / 2 + 0.02));
  }
  // The fruit bowl.
  const bowl = new THREE.Group();
  bowl.position.set(-0.15, H, 0);
  bowl.add(mesh(lathe([[0, 0], [0.05, 0], [0.11, 0.03], [0.14, 0.08], [0.13, 0.08], [0.1, 0.035], [0, 0.02]]), toon('#e8e1d2', { side: THREE.DoubleSide })));
  for (const [x, z, c] of [[-0.04, 0.03, '#d9534f'], [0.05, -0.02, '#7fbf4d'], [0.01, -0.06, '#d9534f']]) bowl.add(sphere(0.04, c, 12).translateX(x).translateY(0.07).translateZ(z));
  for (const k of [0, 1]) {
    const banana = mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 16, 1.6), toon('#f2d34a'));
    banana.rotation.set(Math.PI / 2 - 0.3, 0, 0.6 + k * 0.35);
    banana.position.set(-0.05 + k * 0.02, 0.11 + k * 0.02, 0.06);
    bowl.add(banana);
  }
  g.add(bowl);
  if (item) {
    item.position.set(0.28, H, 0.05);
    g.add(item);
  }
  return g;
}

/** The teal-framed mirror over the dresser. */
export function createMirror() {
  const g = new THREE.Group();
  const s = roundedRect(0.62, 0.82, 0.08);
  s.holes.push(roundedRect(0.5, 0.7, 0.05));
  g.add(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }), toon('#4aa3a0')));
  const glass = mesh(new THREE.ShapeGeometry(roundedRect(0.5, 0.7, 0.05)), new THREE.MeshBasicMaterial({ color: '#cfe7ee' }), { cast: false });
  glass.position.z = 0.015;
  g.add(glass);
  g.add(mesh(new THREE.PlaneGeometry(0.06, 0.5), new THREE.MeshBasicMaterial({ color: '#f4fbfd' }), { cast: false }).translateX(-0.12).translateY(0.05).translateZ(0.016).rotateZ(-0.5));
  return g;
}

/** The olive rug under the coffee table, a darker border round it. */
export function createRug() {
  const g = new THREE.Group();
  const flat = (w, d, color, y) => {
    const m = mesh(new THREE.ShapeGeometry(roundedRect(w, d, 0.06)), toon(color), { cast: false });
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    g.add(m);
  };
  flat(2.9, 2.2, '#a39548', 0.016);
  flat(2.7, 2.0, '#bcae58', 0.018);
  return g;
}

// ---------------------------------------------------------- on the walls

/** The framed red flower beside the TV. */
export function flowerPicture() {
  return picture(0.4, 0.5, '#c9b48a', (ctx, W, H) => {
    ctx.fillStyle = '#f2ead0';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d8ccaa';
    ctx.lineWidth = 3;
    ctx.strokeRect(W * 0.14, H * 0.12, W * 0.72, H * 0.76);
    ctx.strokeStyle = '#5f9a4a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.75);
    ctx.lineTo(W / 2, H * 0.42);
    ctx.stroke();
    ctx.fillStyle = '#5f9a4a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(W / 2 + s * 10, H * 0.62, 10, 4, s * -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d9534f';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(W / 2 + Math.cos(a) * 10, H * 0.36 + Math.sin(a) * 10, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.36, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** A smaller one next to it: a little green hill under a pale sky. */
export function littlePicture() {
  return picture(0.26, 0.34, '#8fae7a', (ctx, W, H) => {
    ctx.fillStyle = '#e8f1e0';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9cc77e';
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.95, W * 0.7, H * 0.4, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(W * 0.7, H * 0.28, 9, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The painting by the sliding door: a pale figure on green, in a dark frame. */
export function greenPainting() {
  return picture(0.5, 0.66, '#5a4632', (ctx, W, H) => {
    ctx.fillStyle = '#7fb257';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5e9a45';
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
    ctx.fillStyle = '#efe3b4';
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.24, W * 0.1, H * 0.07, 0.3, 0, Math.PI * 2);
    ctx.ellipse(W * 0.47, H * 0.5, W * 0.13, H * 0.2, -0.2, 0, Math.PI * 2);
    ctx.ellipse(W * 0.56, H * 0.74, W * 0.09, H * 0.08, 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** A frame `w` by `h` in `color`, with `draw(ctx, W, H)` behind the glass. */
function picture(w, h, color, draw) {
  const g = new THREE.Group();
  const border = 0.035;
  g.add(box(w, h, 0.03, color, 0, 0, 0.015));
  const H = 160;
  const W = Math.round((H * (w - border * 2)) / (h - border * 2));
  const { ctx, texture } = canvasTexture(W, H);
  draw(ctx, W, H);
  texture.needsUpdate = true;
  const face = mesh(new THREE.PlaneGeometry(w - border * 2, h - border * 2), new THREE.MeshBasicMaterial({ map: texture }), { cast: false });
  face.position.z = 0.031;
  g.add(face);
  return g;
}

function lathe(points) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 28);
}

function merge(geometries) {
  const merged = mergeGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}
