import * as THREE from 'three';
import { PALETTE, box, cyl, glow, mesh, noInk, ownToon, rng, sphere, toon } from '../engine/toon.js';
import { createPortal } from './portal.js';
import { CAR, HULL, HULL_Y, carColliders, hullGeometry } from './car.js';
import { canvasTexture, glowTexture, labelTexture, neonSignTexture } from './screens.js';
import { addCollection } from './props/index.js';
import { LIVING_ROOM, buildLivingRoom } from './house/index.js';
import { NO_SHADOW, openWall } from './walls.js';

// Rick's garage, now a seed-stage startup. A cut-away diorama: floor, back
// wall and left wall; the open sides face the camera. Through a door in its
// right wall, the Smiths' living room and a meeting room (house/). The universes in the
// car battery reuse it with their own `theme` (verses.js); the wall boards
// are shared, so every copy shows the same TV and whiteboard.

export const ROOM = { minX: -8, maxX: 8, minZ: -6, maxZ: 6, height: 3.6 };
/** The garage and the living room next door: what the overview looks at. */
export const SITE = { ...ROOM, maxX: LIVING_ROOM.maxX };

// Walkable floor for first-person mode: inside the outer walls. The walls
// between the rooms are colliders.
export const WALK_BOUNDS = { minX: -7.95, maxX: LIVING_ROOM.maxX - 0.05, minZ: -5.95, maxZ: 5.95 };
export const PORTAL = { x: -7.93, y: 1.55, z: 0.25, radius: 1.05 };

export function buildRoom(scene, { theme, dashboard, whiteboard }) {
  const room = new THREE.Group();
  scene.add(room);
  const updaters = [];

  // Floor footprints of the furniture, so you can't walk through it.
  const colliders = [];
  const solidBox = (cx, cz, w, d) => colliders.push({ kind: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  const solidCircle = (x, z, r) => colliders.push({ kind: 'circle', x, z, r });

  // Shell -----------------------------------------------------------------
  const slab = box(16.6, 0.5, 12.6, PALETTE.floor, 0, -0.25, 0);
  room.add(slab);
  room.add(box(16.9, 0.18, 12.9, '#5c6158', 0, -0.59, 0));

  const back = box(16.6, ROOM.height, 0.3, theme.wall, 0, ROOM.height / 2, -6.15);
  const left = box(0.3, ROOM.height, 12.6, theme.wall, -8.15, ROOM.height / 2, 0);
  room.add(back, left);
  room.add(box(16.3, 1.05, 0.03, theme.wallDark, 0.15, 0.525, -5.99, { cast: false }));
  room.add(box(0.03, 1.05, 12.3, theme.wallDark, -7.99, 0.525, 0.15, { cast: false }));
  room.add(box(16.3, 0.05, 0.05, theme.wallTrim, 0.15, 1.05, -5.98, { cast: false }));
  room.add(box(0.05, 0.05, 12.3, theme.wallTrim, -7.98, 1.05, 0.15, { cast: false }));
  room.add(box(16.3, 0.12, 0.06, theme.wallTrim, 0.15, 0.06, -5.97, { cast: false }));
  room.add(box(0.06, 0.12, 12.3, theme.wallTrim, -7.97, 0.06, 0.15, { cast: false }));

  // Oil stains, because it is still a garage.
  const stains = [[5.2, -2.6, 0.55], [6.8, -3.4, 0.35], [-6.2, -2.2, 0.3], [2.4, 4.6, 0.25], [-2.8, 2.9, 0.2]];
  for (const [x, z, r] of stains) {
    const s = mesh(new THREE.CircleGeometry(r, 20), toon(PALETTE.floorStain), { cast: false });
    s.rotation.x = -Math.PI / 2;
    s.scale.set(1, 0.7, 1);
    s.position.set(x, 0.004, z);
    room.add(s);
  }

  room.add(garageDoor(4.7, -5.98, theme));
  room.add(spaceCruiser(CAR.x, CAR.z, CAR.rot));
  colliders.push(...carColliders());

  // Back wall: TV dashboard, neon sign, whiteboard, coffee bar ------------
  const tv = new THREE.Group();
  tv.position.set(-1.4, 2.2, -5.95);
  tv.add(box(3.25, 1.88, 0.08, '#1e2126', 0, 0, 0));
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.74), new THREE.MeshBasicMaterial({ map: dashboard.texture, toneMapped: false }));
  tvScreen.position.z = 0.045;
  tvScreen.userData.board = dashboard;
  tv.add(tvScreen);
  room.add(tv);
  const tvLight = new THREE.PointLight('#7fd6ff', 2.2, 5, 1.8);
  tvLight.position.set(-1.4, 2.0, -5.0);
  room.add(tvLight);

  const wb = new THREE.Group();
  wb.position.set(-5.6, 1.42, -5.96);
  wb.add(box(2.8, 1.6, 0.05, '#b4bac2', 0, 0, 0));
  const wbFace = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.5), new THREE.MeshBasicMaterial({ map: whiteboard.texture }));
  wbFace.position.z = 0.028;
  wbFace.userData.board = whiteboard;
  wb.add(wbFace);
  wb.add(box(1.4, 0.04, 0.1, '#b4bac2', 0, -0.82, 0.05));
  ['#c0392b', '#2980b9', '#27ae60'].forEach((c, i) => {
    const pen = cyl(0.012, 0.012, 0.13, c, 8);
    pen.rotation.z = Math.PI / 2;
    pen.position.set(-0.3 + i * 0.16, -0.79, 0.06);
    wb.add(pen);
  });
  room.add(wb);

  const neon = new THREE.Group();
  neon.position.set(-5.6, 2.88, -5.96);
  neon.add(box(2.95, 0.86, 0.04, '#24262f', 0, 0, 0));
  const neonFace = new THREE.Mesh(new THREE.PlaneGeometry(2.85, 0.84), new THREE.MeshBasicMaterial({ map: neonSignTexture(theme.sign), transparent: true, depthWrite: false, toneMapped: false }));
  neonFace.position.z = 0.03;
  neon.add(noInk(neonFace));
  room.add(neon);
  const neonLight = new THREE.PointLight(theme.neon, 2.3, 4.5, 1.8);
  neonLight.position.set(-5.6, 2.6, -5.2);
  room.add(neonLight);

  room.add(coffeeBar(1.45, -5.62));
  solidBox(1.45, -5.62, 1.9, 0.66);
  room.add(plant(-3.55, -5.45, 1.25, 7));
  room.add(plant(7.35, 5.2, 1.05, 11));
  room.add(plant(-7.35, -5.5, 0.9, 3));
  solidCircle(-3.55, -5.45, 0.32);
  solidCircle(7.35, 5.2, 0.32);
  solidCircle(-7.35, -5.5, 0.32);
  room.add(stringLights());

  // Left wall: workbench, portal, Andúril, shelves, fridge ----------------
  const bench = workbench(-7.45, -3.9);
  room.add(bench);
  solidBox(-7.45, -3.9, 1.05, 2.85);
  // Andúril on the wall, and the rest of the collection on the workbench.
  updaters.push(...addCollection(room, { group: bench, ...BENCH }));
  const portal = createPortal(PORTAL.radius);
  portal.group.position.set(PORTAL.x, PORTAL.y, PORTAL.z);
  portal.group.rotation.y = Math.PI / 2;
  room.add(portal.group);
  updaters.push((dt, t) => portal.update(t));

  room.add(poster(1.45, 2.35, -5.96, 'WUBBA LUBBA', 'DUB DUB SHIP IT', '#97ce4c', 0));
  room.add(shelves(-7.72, 3.3));
  room.add(fridge(-7.45, 5.25));
  solidBox(-7.72, 3.3, 0.52, 2.1);
  solidBox(-7.45, 5.25, 0.8, 0.8);

  // Chill zone ------------------------------------------------------------
  const rug = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.02, 40), toon('#7a5cc8'), { cast: false });
  rug.position.set(-5.2, 0.01, 4.2);
  room.add(rug);
  const rugInner = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.022, 40), toon('#9b7be0'), { cast: false });
  rugInner.position.set(-5.2, 0.012, 4.2);
  room.add(rugInner);
  room.add(beanbag(-5.8, 3.7, '#ff7eb6', 0.4));
  room.add(beanbag(-4.5, 4.8, '#ffd166', -0.6));
  room.add(beanbag(-5.9, 5.1, '#06d6a0', 1.2));
  room.add(pingPong(6.3, 2.7));
  solidBox(6.3, 2.7, 1.72, 2.8);
  for (const [x, z] of [[-5.8, 3.7], [-4.5, 4.8], [-5.9, 5.1]]) solidCircle(x, z, 0.5);

  // Next door, between the car and the ping-pong table: the living room,
  // and the meeting room through it, along the rest of the right wall.
  const living = buildLivingRoom({ theme, height: ROOM.height });
  room.add(living.group);
  colliders.push(...living.colliders);

  // The diorama is open on two sides for the overview. When you walk in, the
  // missing walls and a ceiling close it up; the windows look out into space.
  const enclosure = buildEnclosure(theme);
  enclosure.add(living.walls);
  enclosure.visible = false;
  room.add(enclosure);

  // Lights ------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(theme.sky, '#7b806f', 1.7));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
  // Aimed between the two rooms, so its shadows reach both.
  sun.position.set(10, 13, 8.5);
  sun.target.position.set(3, 0, -0.5);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  return {
    room,
    colliders,
    dashboard,
    whiteboard,
    tvScreen,
    wbFace,
    living,
    setEnclosed(on) {
      enclosure.visible = on;
    },
    /** `camera` is where you are: walking in, the living room's door opens for you. */
    update(dt, t, camera) {
      for (const u of updaters) u(dt, t);
      living.update(dt, t, camera?.position, enclosure.visible);
    },
  };
}

// ------------------------------------------------------------------ props

function buildEnclosure(theme) {
  const g = new THREE.Group();
  const H = ROOM.height;

  // The front wall: window holes open to the stars behind the page, with
  // chunky frames and a sill on each.
  const front = new THREE.Group();
  front.position.z = 6.15;
  const winW = 2.3;
  const length = 16.6;
  const windows = 5;
  const pillar = (length - windows * winW) / (windows + 1);
  const holes = Array.from({ length: windows }, (_, i) => ({
    at: -length / 2 + pillar + i * (pillar + winW) + winW / 2, width: winW, bottom: 0.95, top: 2.45,
  }));
  front.add(openWall(length, H, holes, theme.wall));
  for (const { at } of holes) {
    front.add(box(winW + 0.2, 0.08, 0.42, theme.wallTrim, at, 0.97, 0, NO_SHADOW));
    front.add(box(0.07, 1.5, 0.12, theme.wallTrim, at, 1.7, 0, NO_SHADOW));
    front.add(box(winW, 0.07, 0.12, theme.wallTrim, at, 1.95, 0, NO_SHADOW));
  }
  g.add(front);

  // The right wall is the living room's and the meeting room's (house/).

  // Ceiling with exposed beams and hanging shop lamps.
  g.add(box(16.9, 0.2, 12.9, '#c9cfc6', 0, H + 0.1, 0, NO_SHADOW));
  for (let i = 0; i < 6; i++) g.add(box(0.18, 0.25, 12.3, PALETTE.woodDark, -6.9 + i * 2.75, H - 0.12, 0.15, NO_SHADOW));
  for (const x of [-4.4, 0, 4.4]) {
    for (const z of [-3.2, 0.2, 3.6]) {
      g.add(cyl(0.008, 0.008, 0.7, '#333', 6, NO_SHADOW).translateX(x).translateY(H - 0.35).translateZ(z));
      const shade = mesh(new THREE.ConeGeometry(0.28, 0.22, 20, 1, true), toon('#2f6f8f', { side: THREE.DoubleSide }), NO_SHADOW);
      shade.position.set(x, H - 0.8, z);
      g.add(shade);
      g.add(sphere(0.08, glow('#fff3c4'), 12, NO_SHADOW).translateX(x).translateY(H - 0.9).translateZ(z));
    }
  }
  return g;
}

function garageDoor(x, z, theme) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(0.16, 3.12, 0.14, theme.wallTrim, -2.18, 1.56, 0.02));
  g.add(box(0.16, 3.12, 0.14, theme.wallTrim, 2.18, 1.56, 0.02));
  g.add(box(4.52, 0.2, 0.14, theme.wallTrim, 0, 3.1, 0.02));
  for (let i = 0; i < 6; i++) {
    g.add(box(4.2, 0.47, 0.06, PALETTE.cream, 0, 0.26 + i * 0.5, 0.04));
    if (i === 4) {
      for (let w = 0; w < 4; w++) g.add(box(0.7, 0.26, 0.02, '#6f8fa8', -1.5 + w, 0.26 + i * 0.5, 0.08, { cast: false }));
    }
  }
  g.add(box(0.4, 0.05, 0.06, PALETTE.metalDark, 0, 0.62, 0.1));
  return g;
}

function spaceCruiser(x, z, rot) {
  // Rick's flying car, parked in front of the garage door.
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const hullMat = toon('#aeb6be');
  // With an opening over the engine: the hood and the bay are in battery.js.
  const hull = mesh(hullGeometry(), hullMat);
  hull.scale.copy(HULL);
  hull.position.y = HULL_Y;
  g.add(hull);
  const skirt = mesh(new THREE.CylinderGeometry(1.0, 0.9, 0.18, 36), toon('#8b939c'));
  skirt.scale.set(1.5, 1, 0.82);
  skirt.position.y = 0.52;
  g.add(skirt);
  const canopy = mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), toon('#bfeaf7'));
  canopy.scale.set(0.72, 0.5, 0.62);
  canopy.position.set(0.25, 0.92, 0);
  g.add(canopy);
  // Seats peeking through the glass.
  for (const s of [-1, 1]) g.add(box(0.28, 0.3, 0.28, '#8a4b3a', 0.05, 1.05, s * 0.25));
  g.add(box(0.7, 0.5, 1.2, '#7c848f', -1.2, 0.85, 0));
  for (const s of [-1, 1]) {
    const pipe = cyl(0.12, 0.15, 0.4, '#5d646e', 16);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-1.65, 0.8, s * 0.35);
    g.add(pipe);
    const flame = mesh(new THREE.CircleGeometry(0.09, 16), glow('#ffb347'));
    flame.rotation.y = -Math.PI / 2;
    flame.position.set(-1.86, 0.8, s * 0.35);
    g.add(flame);
    const fin = box(0.5, 0.55, 0.06, PALETTE.red, -1.3, 1.25, s * 0.5);
    fin.rotation.z = -0.5;
    fin.rotation.x = s * 0.3;
    g.add(fin);
    const light = sphere(0.07, glow('#fff3a0'), 12);
    light.position.set(1.5, 0.72, s * 0.35);
    g.add(light);
  }
  for (const [lx, lz] of [[0.9, 0.5], [0.9, -0.5], [-0.9, 0]]) {
    g.add(cyl(0.035, 0.035, 0.45, '#5d646e', 8).translateX(lx).translateY(0.225).translateZ(lz));
    g.add(cyl(0.12, 0.14, 0.04, '#5d646e', 12).translateX(lx).translateY(0.02).translateZ(lz));
  }
  // Junk on the roof: it is Rick's car.
  g.add(box(0.35, 0.18, 0.3, '#c9a36b', -0.9, 1.19, -0.2).rotateY(0.3));
  // Clicking the car pops its hood (battery.js).
  g.traverse((o) => { if (o.isMesh) o.userData.car = true; });
  return g;
}

// The workbench's two surfaces and the face of its pegboard, for what's kept
// on them (props/index.js).
const BENCH = { top: 0.96, shelf: 0.305, board: -0.48 };

function workbench(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const L = 2.8;
  g.add(box(1.0, 0.08, L, PALETTE.wood, 0, BENCH.top - 0.04, 0));
  g.add(box(0.9, 0.05, L - 0.2, PALETTE.woodDark, 0, BENCH.shelf - 0.025, 0));
  for (const sx of [-0.42, 0.42]) for (const sz of [-L / 2 + 0.1, L / 2 - 0.1]) g.add(box(0.07, 0.9, 0.07, PALETTE.woodDark, sx, 0.45, sz));
  // Pegboard, for whatever ends up hanging there.
  g.add(box(0.04, 1.3, L - 0.1, ownToon('#c9a26d', { map: pegboardTexture(L - 0.1, 1.3) }), BENCH.board - 0.02, 1.95, 0));
  return g;
}

/** A hole every 5cm, on a `w` by `h` board. */
function pegboardTexture(w, h) {
  const { ctx, texture } = canvasTexture(32, 32);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#5b3f22';
  ctx.beginPath();
  ctx.arc(16, 16, 5, 0, Math.PI * 2);
  ctx.fill();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.round(w / 0.05), Math.round(h / 0.05));
  texture.needsUpdate = true;
  return texture;
}

function coffeeBar(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(1.8, 0.9, 0.6, '#c89560', 0, 0.45, 0));
  g.add(box(1.86, 0.05, 0.64, '#ebe6da', 0, 0.925, 0));
  // Espresso machine.
  g.add(box(0.46, 0.4, 0.34, '#c0c6ce', -0.45, 1.15, -0.04));
  g.add(box(0.3, 0.06, 0.12, '#5d646e', -0.45, 1.02, 0.14));
  g.add(cyl(0.035, 0.035, 0.05, '#fff', 10).translateX(-0.5).translateY(1.0).translateZ(0.16));
  // Kombucha on tap.
  g.add(cyl(0.18, 0.18, 0.5, '#8b939c', 18).translateX(0.2).translateY(1.2));
  g.add(cyl(0.19, 0.19, 0.05, '#5d646e', 18).translateX(0.2).translateY(1.46));
  g.add(box(0.2, 0.08, 0.02, glow('#ffd166'), 0.2, 1.22, 0.19));
  for (let i = 0; i < 3; i++) g.add(cyl(0.04, 0.035, 0.1, ['#e74c3c', '#f5f5f5', '#3498db'][i], 12).translateX(0.55 + i * 0.12).translateY(1.0).translateZ(0.1));
  // Fruit bowl nobody touches.
  g.add(cyl(0.16, 0.1, 0.08, '#e8e1d2', 16).translateX(0.72).translateY(0.99).translateZ(-0.12));
  for (let i = 0; i < 4; i++) g.add(sphere(0.045, ['#e74c3c', '#f1c40f', '#27ae60', '#e67e22'][i], 10).translateX(0.66 + (i % 2) * 0.1).translateY(1.06).translateZ(-0.15 + Math.floor(i / 2) * 0.07));
  return g;
}

function plant(x, z, h, seed) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(cyl(0.26, 0.2, 0.46, '#e07a5f', 18).translateY(0.23));
  g.add(cyl(0.27, 0.27, 0.05, '#c9654d', 18).translateY(0.46));
  g.add(cyl(0.23, 0.23, 0.02, '#5a3d2b', 18, { cast: false }).translateY(0.47));
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const stemH = h * (0.45 + r() * 0.55);
    const lean = 0.2 + r() * 0.35;
    const stem = cyl(0.012, 0.015, stemH, PALETTE.plantDark, 6);
    stem.geometry.translate(0, stemH / 2, 0);
    stem.position.y = 0.46;
    stem.rotation.set(Math.sin(a) * lean, 0, Math.cos(a) * lean);
    const leaf = sphere(0.16 + r() * 0.08, i % 2 ? PALETTE.plant : PALETTE.plantDark, 12);
    leaf.scale.set(1, 0.25, 0.65);
    leaf.position.y = stemH;
    leaf.rotation.set(0.3, a, 0.4);
    stem.add(leaf);
    g.add(stem);
  }
  return g;
}

function stringLights() {
  const g = new THREE.Group();
  const runs = [
    [new THREE.Vector3(-7.95, 3.35, -5.95), new THREE.Vector3(2.4, 3.35, -5.95)],
    [new THREE.Vector3(-7.95, 3.35, -5.95), new THREE.Vector3(-7.95, 3.35, 5.5)],
  ];
  const colors = ['#ffd166', '#ff7eb6', '#7ae582', '#6ec6ee'];
  let k = 0;
  for (const [a, b] of runs) {
    const pts = [];
    const sags = Math.round(a.distanceTo(b) / 2.2);
    for (let i = 0; i <= sags * 8; i++) {
      const f = i / (sags * 8);
      const p = a.clone().lerp(b, f);
      p.y -= Math.sin(((f * sags) % 1) * Math.PI) * 0.22;
      p.addScaledVector(new THREE.Vector3(b.z === a.z ? 0 : 1, 0, b.z === a.z ? 1 : 0), 0.05);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.008, 4), toon('#333'), { cast: false }));
    for (let i = 0; i < pts.length; i += 4) {
      const bulb = sphere(0.045, glow(colors[k++ % colors.length]), 10, { cast: false });
      bulb.position.copy(pts[i]).add(new THREE.Vector3(0, -0.05, 0));
      g.add(bulb);
    }
  }
  return g;
}

function poster(x, y, z, top, bottom, color, rotY = Math.PI / 2) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    ctx.fillStyle = '#20232b';
    ctx.fillRect(0, 0, 360, 480);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(16, 16, 328, 448);
    // A portal swirl.
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.strokeStyle = i % 2 ? '#97ce4c' : '#d6ff8a';
      ctx.lineWidth = 8;
      ctx.arc(180, 205, 110 - i * 17, i, i + Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.font = '46px "Luckiest Guy", system-ui';
    ctx.fillText(top, 180, 390);
    ctx.fillStyle = '#f4efe1';
    ctx.font = '30px "Luckiest Guy", system-ui';
    ctx.fillText(bottom, 180, 432);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  g.add(box(0.95, 1.25, 0.03, '#20232b', 0, 0, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = 0.018;
  g.add(face);
  return g;
}

function shelves(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const r = rng(42);
  for (const s of [-1, 1]) g.add(box(0.5, 2.3, 0.05, PALETTE.woodDark, 0, 1.15, s * 1.0));
  for (let level = 0; level < 4; level++) {
    const y = 0.3 + level * 0.62;
    g.add(box(0.5, 0.04, 2.0, PALETTE.wood, 0, y, 0));
    let zz = -0.85;
    while (zz < 0.8) {
      const kind = r();
      if (kind < 0.45) {
        const w = 0.05 + r() * 0.05;
        const h = 0.25 + r() * 0.15;
        const book = box(0.3, h, w, ['#c0392b', '#2980b9', '#f39c12', '#8e44ad', '#16a085', '#ecf0f1'][Math.floor(r() * 6)], 0, y + 0.02 + h / 2, zz + w / 2);
        g.add(book);
        zz += w + 0.01;
      } else if (kind < 0.7) {
        g.add(cyl(0.07, 0.07, 0.22, '#e8f4f0', 12).translateY(y + 0.13).translateZ(zz + 0.08));
        g.add(cyl(0.06, 0.06, 0.14, glow(['#97ce4c', '#6ec6ee', '#ff5fa2'][Math.floor(r() * 3)]), 12).translateY(y + 0.1).translateZ(zz + 0.08));
        zz += 0.2;
      } else if (kind < 0.85) {
        g.add(box(0.36, 0.2, 0.3, '#c9a36b', 0, y + 0.12, zz + 0.16));
        zz += 0.36;
      } else {
        // A McDonald's Szechuan sauce packet, framed like a relic.
        g.add(box(0.04, 0.2, 0.16, '#f2c94c', -0.1, y + 0.12, zz + 0.1).rotateZ(-0.15));
        zz += 0.24;
      }
    }
  }
  return g;
}

function fridge(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(0.78, 1.9, 0.78, '#e9eef2', 0, 0.95, 0));
  g.add(box(0.02, 1.1, 0.7, '#bfe6ff', 0.4, 1.2, 0, { cast: false }));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) g.add(cyl(0.035, 0.035, 0.2, ['#97ce4c', '#ff7eb6', '#ffd166'][i], 8).translateX(0.3).translateY(0.8 + i * 0.35).translateZ(-0.25 + j * 0.16));
  }
  g.add(box(0.04, 0.5, 0.04, '#8b939c', 0.42, 1.2, -0.3));
  const sign = mesh(new THREE.PlaneGeometry(0.5, 0.14), new THREE.MeshBasicMaterial({ map: labelTexture('KOMBUCHA', { bg: '#ff7eb6', fg: '#2b0a1a', w: 320, h: 90, font: '46px "Luckiest Guy", system-ui' }) }), { cast: false });
  sign.rotation.y = Math.PI / 2;
  sign.position.set(0.415, 1.7, 0);
  g.add(sign);
  return g;
}

function beanbag(x, z, color, rot) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const b = sphere(1, color, 24);
  b.scale.set(0.55, 0.36, 0.55);
  b.position.y = 0.3;
  g.add(b);
  const back = sphere(1, color, 20);
  back.scale.set(0.45, 0.35, 0.28);
  back.position.set(0, 0.52, -0.28);
  g.add(back);
  return g;
}

// `top` is the height of the playing surface, where the paddles and ball lie.
const TABLE = { w: 1.52, d: 2.74, top: 0.785, green: '#1f6f55' };

function pingPong(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  // Lines are painted on so they can't z-fight with the top or shimmer edge-on.
  const green = toon(TABLE.green);
  const top = mesh(new THREE.BoxGeometry(TABLE.w, 0.05, TABLE.d), [green, green, ownToon('#ffffff', { map: tableLines() }), green, green, green]);
  top.position.y = TABLE.top - 0.025;
  g.add(top);
  // At 2cm the net is thinner than the sun's normalBias, so shadow lookups
  // pushed off one face land beyond the other and it shadows itself in a
  // jagged band.
  g.add(box(1.7, 0.16, 0.02, '#e9eef2', 0, TABLE.top + 0.075, 0, { receive: false }));
  for (const sx of [-0.65, 0.65]) for (const sz of [-1.2, 1.2]) g.add(box(0.06, 0.74, 0.06, '#2b2e33', sx, 0.37, sz));
  for (const [px, pz, c] of [[0.3, 0.9, '#d63031'], [-0.4, -1.0, '#0984e3']]) {
    const paddle = new THREE.Group();
    paddle.position.set(px, TABLE.top + 0.0075, pz);
    paddle.rotation.y = px;
    paddle.add(cyl(0.08, 0.08, 0.015, c, 16));
    paddle.add(box(0.03, 0.015, 0.1, '#b98552', 0, 0, 0.11));
    g.add(paddle);
  }
  g.add(sphere(0.02, '#fff', 10).translateY(TABLE.top + 0.02).translateZ(0.3).translateX(-0.2));
  return g;
}

let tableTexture;

/**
 * The table-tennis top: 2cm white lines round the edge and down the middle.
 * Built once and shared by every office.
 */
function tableLines() {
  if (tableTexture) return tableTexture;
  // Each mip level paints its own lines at least a texel wide; averaged down
  // by the GPU they fade into the green from the overview.
  const levels = [];
  for (let w = 512, h = 1024; h >= 1; w = Math.max(1, w >> 1), h >>= 1) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const lx = Math.max(1, Math.round((0.02 / TABLE.w) * w));
    const lz = Math.max(1, Math.round((0.02 / TABLE.d) * h));
    ctx.fillStyle = TABLE.green;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f6f8';
    for (const x of [0, Math.round((w - lx) / 2), w - lx]) ctx.fillRect(x, 0, lx, h);
    for (const z of [0, h - lz]) ctx.fillRect(0, z, w, lz);
    levels.push(canvas);
  }
  tableTexture = new THREE.CanvasTexture(levels[0]);
  tableTexture.mipmaps = levels;
  tableTexture.colorSpace = THREE.SRGBColorSpace;
  // Sharp at the low angles you see it at walking past.
  tableTexture.anisotropy = 16;
  tableTexture.userData.shared = true;
  return tableTexture;
}
