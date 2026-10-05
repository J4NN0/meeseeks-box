import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cyl, mesh, ownToon, toon } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';
import { IRON, hookGeometry } from '../hanging.js';

// Wado Ichimonji (One Piece): Kuina's white katana, one of the 21 Great Grade
// blades, which Zoro asked her father for after she died and carries in his
// mouth for Three Sword Style. After the series and the replicas made from
// it: a pure white saya with a modest gold kojiri, white tsuka-ito over grey
// ray skin leaving a row of diamonds down each side, a thick, rounded oval
// tsuba and the fuchi and kashira in gold. No sageo: the anime's has none,
// nor has Bandai's PROPLICA. Sheathed and hung as a katana is kept at peace:
// edge up, hilt to the left, resting on two pegboard hooks.
//
// Origin: the middle of its back, on the board. Faces +z.

// The room's light is warm: a cool white keeps them reading as white.
const SAYA_WHITE = '#f2f5f7';
const ITO = '#f5f7f8';
const SAME = '#46474d';
const GOLD = '#dcb04a';
const GOLD_DEEP = '#bf9238';
const RUBBER = '#1d1e21';

// Along the sword from the mouth of the saya (s = 0) to its tip; the hilt is
// the negative side. A 72cm blade in a 76cm saya and a 28cm tsuka: 105cm in
// all, as the replicas.
const SAYA = 0.76;
const KOJIRI = 0.024;
const SEPPA = 0.0022;
const TSUBA = { thick: 0.007, high: 0.039, wide: 0.036 };
const GUARD = 2 * SEPPA + TSUBA.thick;
const FUCHI = 0.013;
const TSUKA = 0.282;
const KASHIRA = 0.014;
const END = -(GUARD + TSUKA);
// Its curve (sori): about 2cm over the blade, on an arc of this radius, with
// the edge on the outside.
const SORI = 3.6;
// Off the board far enough for the tsuba to clear it.
const SWORD_Z = 0.047;
// The hooks, holding the saya by its mouth and two thirds along: where the
// first is, the one it hangs from, and their wire and shape.
const HOOK = { y: -0.025, x: -0.175, wire: 0.0028, reach: 0.066, bend: 0.014, rise: 0.018, sleeve: 0.0045 };
const HOLDS = [0.06, 0.51];
// The kurikata, the knob on the saya a sageo would be tied through.
const KURIKATA = 0.115;

export function createWadoIchimonji() {
  const g = new THREE.Group();
  // Settled on the hooks: tilted until it lies on both, then down onto them.
  const [a, b] = HOLDS.map(underside);
  const tilt = -Math.atan2(b.y - a.y, b.x - a.x);
  for (const p of [a, b]) p.rotateAround(new THREE.Vector2(), tilt);
  const sword = new THREE.Group();
  sword.rotation.z = tilt;
  sword.position.set(HOOK.x - a.x, HOOK.y + HOOK.sleeve - a.y, SWORD_Z);
  sword.add(saya(), tsuka(), guard());
  g.add(sword);
  for (const p of [a, b]) g.add(hook(p.x + sword.position.x));
  g.userData.hole = new THREE.Vector3(HOOK.x, HOOK.y, 0);
  return g;
}

// The centre line ------------------------------------------------------------

/** Where the centre line is at `s`, along it, and up (towards the edge). */
function frame(s) {
  const phi = (Math.max(s, 0) - SAYA / 2) / SORI;
  const t = new THREE.Vector3(Math.cos(phi), -Math.sin(phi), 0);
  const up = new THREE.Vector3(Math.sin(phi), Math.cos(phi), 0);
  const p = new THREE.Vector3(SORI * Math.sin(phi), SORI * (Math.cos(phi) - 1), 0);
  // The tsuka runs straight on from the mouth.
  if (s < 0) p.addScaledVector(t, s);
  return { p, t, up };
}

/** The bottom of the saya at `s`, where it lies on a hook. */
function underside(s) {
  const { p, up } = frame(s);
  p.addScaledVector(up, -sayaSize(s)[0]);
  return new THREE.Vector2(p.x, p.y);
}

/** Half the saya's height (edge to back) and width at `s`: it slims to the tip. */
function sayaSize(s) {
  const k = s / SAYA;
  return [0.0175 - 0.0027 * k, 0.0128 - 0.0023 * k];
}

/** 1, rounding down to 0 over the last `r` before an end `d` away. */
function dome(d, r) {
  return d >= r ? 1 : Math.sqrt(Math.max(0, 1 - ((r - d) / r) ** 2));
}

/**
 * A tube along the centre line from `s0` to `s1` in `n` steps, `size(s)`
 * giving its half height and width. `egg` narrows it towards the edge. u runs
 * round from the top, v along.
 */
function sweep(s0, s1, n, size, { seg = 20, egg = 0 } = {}) {
  const pos = [];
  const uv = [];
  const index = [];
  for (let j = 0; j <= n; j++) {
    const s = s0 + ((s1 - s0) * j) / n;
    const [h, w] = size(s);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const { p, up } = frame(s);
      p.addScaledVector(up, h * c);
      pos.push(p.x, p.y, w * Math.sin(a) * (1 - egg * c));
      uv.push(i / seg, j / n);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const c = a + seg + 1;
      index.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  // Smooth across the seam along the top, where the ring starts and ends.
  const nrm = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let j = 0; j <= n; j++) {
    const a = j * (seg + 1);
    v.set(nrm.getX(a) + nrm.getX(a + seg), nrm.getY(a) + nrm.getY(a + seg), nrm.getZ(a) + nrm.getZ(a + seg)).normalize();
    nrm.setXYZ(a, v.x, v.y, v.z);
    nrm.setXYZ(a + seg, v.x, v.y, v.z);
  }
  return geo;
}

/** `geo`, made in a frame with z along the sword and y up, moved to `s`. */
function at(geo, s, out = 0) {
  const { p, t, up } = frame(s);
  const z = new THREE.Vector3(0, 0, 1);
  p.addScaledVector(z, out);
  // x across to the back keeps it right-handed with z along the sword.
  return geo.applyMatrix4(new THREE.Matrix4().makeBasis(z.negate(), up, t).setPosition(p));
}

const merged = (list) => mergeGeometries(list.map((geo) => (geo.index ? geo.toNonIndexed() : geo)));

function oval(rx, ry) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  return s;
}

// The parts --------------------------------------------------------------------

function saya() {
  const g = new THREE.Group();
  // Run on into the seppa and under the kojiri, so no edge shows where they meet.
  const body = sweep(-0.001, SAYA - KOJIRI + 0.002, 30, sayaSize, { seg: 24, egg: 0.12 });
  // The kurikata, on the outer side by the mouth.
  const knob = new THREE.SphereGeometry(0.0085, 12, 8);
  knob.scale(0.42, 0.55, 1);
  at(knob, KURIKATA, sayaSize(KURIKATA)[1]);
  g.add(mesh(merged([body, knob]), toon(SAYA_WHITE)));
  return g;
}

function tsuka() {
  const g = new THREE.Group();
  const from = END + KASHIRA - 0.002;
  const to = -(GUARD + FUCHI) + 0.002;
  const mid = (from + to) / 2;
  const half = (to - from) / 2;
  // Waisted a little between the ends; oval, flatter side to side.
  const size = (s) => {
    const h = 0.0152 + 0.0016 * ((s - mid) / half) ** 2;
    return [h, h * 0.8];
  };
  const wrap = sweep(from, to, 16, size, { seg: 24 });
  g.add(mesh(wrap, ownToon('#ffffff', { map: itoTexture() })));

  const fuchi = sweep(-(GUARD + FUCHI), -GUARD + SEPPA, 1, () => [0.0178, 0.0142], { seg: 24 });
  const kashira = sweep(END, END + KASHIRA, 10, (s) => [0.0174, 0.0139].map((v) => v * dome(s - END, 0.007)), { seg: 24 });
  const kojiri = sweep(SAYA - KOJIRI, SAYA, 12, (s) => sayaSize(s).map((v) => (v + 0.0008) * dome(SAYA - s, 0.011)), { seg: 24, egg: 0.12 });
  g.add(mesh(merged([fuchi, kashira, kojiri]), toon(GOLD)));
  return g;
}

/** The tsuba between its two seppa: a thick oval plate with a raised rim. */
function guard() {
  const g = new THREE.Group();
  const centre = -(SEPPA + TSUBA.thick / 2);
  const plate = new THREE.ExtrudeGeometry(oval(TSUBA.wide - 0.003, TSUBA.high - 0.003), { depth: 0.004, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 28 });
  plate.translate(0, 0, -0.002);
  g.add(mesh(at(plate, centre), toon(GOLD_DEEP)));

  const ring = oval(TSUBA.wide - 0.0008, TSUBA.high - 0.0008);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, TSUBA.wide - 0.0045, TSUBA.high - 0.0045, 0, Math.PI * 2, true, 0);
  ring.holes.push(hole);
  const rim = new THREE.ExtrudeGeometry(ring, { depth: TSUBA.thick - 0.0016, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 28 });
  rim.translate(0, 0, -(TSUBA.thick - 0.0016) / 2);
  const seppa = [-SEPPA / 2, -GUARD + SEPPA / 2].map((s) => {
    // Chamfered: a sharp edge this thin only got inked here and there.
    const geo = new THREE.ExtrudeGeometry(oval(0.0156, 0.0196), { depth: SEPPA - 0.0012, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 20 });
    geo.translate(0, 0, -(SEPPA - 0.0012) / 2);
    return at(geo, s);
  });
  g.add(mesh(merged([at(rim, centre), ...seppa]), toon(GOLD)));
  return g;
}

/** A J-hook out of a hole in the board, sleeved where the saya lies on it. */
function hook(x) {
  const g = new THREE.Group();
  g.add(mesh(hookGeometry(x, HOOK.y, HOOK), toon(IRON)));
  const pad = cyl(HOOK.sleeve, HOOK.sleeve, 0.042, RUBBER, 12);
  pad.rotation.x = Math.PI / 2;
  pad.position.set(x, HOOK.y, 0.043);
  g.add(pad);
  return g;
}

/**
 * The tsuka-ito, round the grip (u) and along it (v): white cord crossing
 * on each side and leaving a diamond of ray skin between the crossings.
 */
function itoTexture() {
  const W = 128;
  const H = 512;
  const N = 10;
  const { ctx, texture } = canvasTexture(W, H);
  ctx.fillStyle = ITO;
  ctx.fillRect(0, 0, W, H);
  const p = H / N;
  const a = W * 0.09;
  const b = p * 0.25;
  // The sides of the grip face out at a quarter and three quarters round.
  for (const u of [W * 0.25, W * 0.75]) {
    for (let k = 0; k < N; k++) {
      const y = (k + 0.5) * p;
      ctx.fillStyle = SAME;
      ctx.beginPath();
      ctx.moveTo(u - a, y);
      ctx.lineTo(u, y - b);
      ctx.lineTo(u + a, y);
      ctx.lineTo(u, y + b);
      ctx.closePath();
      ctx.fill();
    }
  }
  // The cord's edges: crossing between the diamonds, and slanting over the
  // top and bottom of the grip to the other side (drawn a turn either way so
  // they wrap round).
  ctx.strokeStyle = 'rgba(138, 130, 116, 0.6)';
  ctx.lineWidth = 2;
  for (const shift of [-W, 0, W]) {
    for (const u of [W * 0.25 + shift, W * 0.75 + shift]) {
      for (let k = -1; k <= N; k++) {
        const y = (k + 0.5) * p;
        ctx.beginPath();
        ctx.moveTo(u - a, y);
        ctx.lineTo(u + a, y + p);
        ctx.moveTo(u + a, y);
        ctx.lineTo(u - a, y + p);
        for (const dy of [-p / 2, p / 2]) {
          ctx.moveTo(u + a, y);
          ctx.lineTo(u + W / 2 - a, y + dy);
        }
        ctx.stroke();
      }
    }
  }
  texture.needsUpdate = true;
  return texture;
}
