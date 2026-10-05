import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glow, mesh, noInk, rng, toon } from '../engine/toon.js';
import { canvasTexture } from './screens.js';

// Joyce Byers' Christmas lights from Stranger Things: an old strand of C9
// bulbs (big strawberry-shaped glass, red, orange, yellow, green and blue in
// no order) in green sockets on dark green wire, a foot apart, sagging along
// the tops of the walls and hanging every which way. The cord comes down the
// wall to a switch; the switch, the wire or any bulb turns them on and off.
//
// The switch is one for every copy of the room (setChristmasLights), so the
// universes in the battery match the garage.

const SPACING = 0.3;
const SAG = { every: 2.2, depth: 0.1 };
const WIRE = '#2c4a2b';
const COLORS = ['#ff3b30', '#ff8a1c', '#ffd23f', '#38d65a', '#3a7bff'];
/** A C9: 1⅛" across at its widest, about 2" of glass beyond the socket. */
const BULB = [[0.0085, 0], [0.0112, 0.006], [0.014, 0.016], [0.0143, 0.021], [0.0126, 0.032], [0.0088, 0.042], [0.0045, 0.049], [0, 0.0515]];
const SOCKET = { radius: 0.0115, length: 0.03 };

let on = true;
export const christmasLightsOn = () => on;
export function setChristmasLights(value) { on = !!value; }

/**
 * `runs` are { from, to, inward } along the tops of the walls, `inward` being
 * the way into the room; the strand ends at the last run's `to`, where its
 * cord drops to the switch at `plug` on a wall facing `plugFacing`.
 */
export function createChristmasLights({ runs, plug, plugFacing }) {
  const g = new THREE.Group();
  const random = rng(1983);
  const wires = [];
  const sockets = [];
  const bulbs = COLORS.map(() => []);
  const halos = [];
  const halo = [];
  const bulbGeometry = new THREE.LatheGeometry(BULB.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  const socketGeometry = new THREE.CylinderGeometry(SOCKET.radius * 0.9, SOCKET.radius, SOCKET.length, 10).translate(0, SOCKET.length / 2, 0);
  const up = new THREE.Vector3(0, 1, 0);
  let last = -1;

  for (const { from, to, inward } of runs) {
    const sags = Math.max(1, Math.round(from.distanceTo(to) / SAG.every));
    const pts = [];
    for (let i = 0; i <= sags * 8; i++) {
      const f = i / (sags * 8);
      const p = from.clone().lerp(to, f).addScaledVector(inward, 0.05);
      p.y -= Math.sin(((f * sags) % 1) * Math.PI) * SAG.depth;
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    wires.push(curve);
    const n = Math.floor(curve.getLength() / SPACING);
    for (let i = 0; i < n; i++) {
      const at = curve.getPointAt((i + 0.5) / n);
      // Hanging, but each its own way, and never back into the wall.
      const tilt = 0.15 + random() * 0.5;
      const turn = random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(turn), -Math.cos(tilt), Math.sin(tilt) * Math.sin(turn));
      if (dir.dot(inward) < 0) dir.addScaledVector(inward, -2 * dir.dot(inward));
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      sockets.push(socketGeometry.clone().applyQuaternion(q).translate(at.x, at.y, at.z));
      const base = at.clone().addScaledVector(dir, SOCKET.length - 0.002);
      // Never the same colour twice in a row.
      let c = Math.floor(random() * COLORS.length);
      if (c === last) c = (c + 1 + Math.floor(random() * (COLORS.length - 1))) % COLORS.length;
      last = c;
      bulbs[c].push(bulbGeometry.clone().applyQuaternion(q).translate(base.x, base.y, base.z));
      halos.push(base.clone().addScaledVector(dir, 0.024));
      halo.push(...new THREE.Color(COLORS[c]).toArray());
    }
  }

  // The cord down the wall to the switch.
  const end = wires.at(-1).getPoint(1);
  const facing = plugFacing.clone().normalize();
  const top = plug.clone().add(new THREE.Vector3(0, 0.07, 0)).addScaledVector(facing, 0.004);
  const cord = new THREE.CatmullRomCurve3([end, new THREE.Vector3(end.x, end.y - 0.25, end.z).addScaledVector(facing, -0.025), top.clone().add(new THREE.Vector3(0, 0.3, 0)), top]);

  const wireGeometry = mergeGeometries([
    ...wires.map((c) => new THREE.TubeGeometry(c, Math.ceil(c.getLength() * 24), 0.0045, 5)),
    new THREE.TubeGeometry(cord, 60, 0.0045, 5),
  ]);
  g.add(mesh(wireGeometry, toon(WIRE), { cast: false }));
  if (sockets.length) g.add(mesh(mergeGeometries(sockets), toon('#3d6b35'), { cast: false }));
  const glass = bulbs.map((list, i) => list.length && mesh(mergeGeometries(list), glow(COLORS[i]), { cast: false })).filter(Boolean);
  const lit = glass.map((m) => m.material);
  const unlit = COLORS.filter((_, i) => bulbs[i].length).map((c) => toon(new THREE.Color(c).multiplyScalar(0.45).getStyle()));
  g.add(...glass);

  // The soft glow round each lit bulb.
  const haloGeometry = new THREE.BufferGeometry().setFromPoints(halos);
  haloGeometry.setAttribute('color', new THREE.Float32BufferAttribute(halo, 3));
  const glows = new THREE.Points(haloGeometry, new THREE.PointsMaterial({
    size: 0.4, map: haloTexture(), vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false,
  }));
  g.add(noInk(glows));

  const toggle = lightSwitch();
  toggle.group.position.copy(plug);
  toggle.group.rotation.y = Math.atan2(facing.x, facing.z);
  g.add(toggle.group);

  // Easier to hit than a 9mm wire from across the room; never drawn.
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  for (const c of wires) g.add(noInk(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.09, 4), hidden)));
  g.traverse((o) => { if (o.isMesh) o.userData.christmasLights = true; });

  let shown = null;
  return {
    group: g,
    update(dt) {
      if (shown !== on) {
        shown = on;
        glass.forEach((m, i) => { m.material = on ? lit[i] : unlit[i]; });
        glows.visible = on;
      }
      toggle.update(dt);
    },
  };
}

/** White fading out from the middle: tinted per bulb, it colours the wall behind. */
function haloTexture() {
  const { ctx, texture } = canvasTexture(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return texture;
}

/** A cream toggle switch on the wall, its lever up when they're on. Faces +z. */
function lightSwitch() {
  const g = new THREE.Group();
  const plate = mesh(new THREE.BoxGeometry(0.07, 0.114, 0.006), toon('#efe6cf'), { cast: false });
  plate.position.z = 0.003;
  g.add(plate);
  for (const y of [-0.038, 0.038]) {
    const screw = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8), toon('#c9c2ae'), { cast: false });
    screw.rotation.x = Math.PI / 2;
    screw.position.set(0, y, 0.0065);
    g.add(screw);
  }
  const lever = new THREE.Group();
  lever.position.z = 0.006;
  const stick = mesh(new THREE.BoxGeometry(0.011, 0.011, 0.02), toon('#f6efdc'), { cast: false });
  stick.position.z = 0.01;
  lever.add(stick);
  g.add(lever);
  // Bigger than the switch, so you can hit it from a few steps away; never drawn.
  const reach = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.08), new THREE.MeshBasicMaterial({ visible: false }));
  g.add(noInk(reach));
  return {
    group: g,
    update(dt) {
      lever.rotation.x = THREE.MathUtils.damp(lever.rotation.x, on ? -0.45 : 0.45, 18, dt);
    },
  };
}
