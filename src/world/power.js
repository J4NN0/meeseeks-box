import * as THREE from 'three';
import { box, cyl, noInk, toon } from '../engine/toon.js';
import { canvasTexture } from './screens.js';
import { BOX } from './backdrop.js';

// Inside a battery, the office is what powers the one upstairs, as Zeep's
// people power Rick's car: a gauge on the back wall, a conduit from the
// floor up past it, and a cable from the top of the wall to the battery's
// "+" terminal on the glass roof above (backdrop.js). Sparks of power run up it,
// faster the more agents are working, and the gauge's needle reads the load.
// The cable goes up: that's where the office it powers is.

const X = -3.57;
const WALL_Z = -5.93;
// Over the potted plant below it.
const GAUGE_Y = 2.4;
/** Beside the gauge, where the conduit runs up the wall. */
const PIPE_X = X - 0.52;
/** Where the cable meets the battery's glass roof, high above. */
const TERMINAL = new THREE.Vector3(PIPE_X - 2, BOX.h / 2 - 0.6, -16);
const SPARKS = 9;
const SPARK = '#fff27a';
/** The needle's swing, from no load to full, in radians. */
const SWEEP = 2.2;

function gaugeFace(to) {
  const { ctx, texture } = canvasTexture(320, 360);
  ctx.fillStyle = '#1b1f1a';
  ctx.beginPath();
  ctx.roundRect(6, 6, 308, 348, 26);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#4a5146';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff27a';
  ctx.font = "38px 'Luckiest Guy', Impact, sans-serif";
  ctx.fillText('⚡ POWERING', 160, 52, 280);
  ctx.fillStyle = '#f4efe1';
  ctx.font = "800 28px Nunito, system-ui, sans-serif";
  ctx.fillText(`THE ${to.toUpperCase()}`, 160, 96, 280);
  // The dial: green, yellow, red.
  const cx = 160, cy = 250, r = 104;
  // Canvas angles: straight up is -π/2, and the dial sweeps clockwise.
  const from = -Math.PI / 2 - SWEEP / 2;
  [['#5fd35a', 0, 0.55], ['#f2c94c', 0.55, 0.8], ['#e74c3c', 0.8, 1]].forEach(([c, a, b]) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, from + a * SWEEP, from + b * SWEEP);
    ctx.stroke();
  });
  ctx.strokeStyle = '#f4efe1';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 10; i++) {
    const a = from + (i / 10) * SWEEP;
    const inner = i % 5 === 0 ? r - 30 : r - 20;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
    ctx.stroke();
  }
  ctx.fillStyle = '#9aa39a';
  ctx.font = "800 20px Nunito, system-ui, sans-serif";
  ctx.fillText('LOAD', cx, cy + 50);
  texture.needsUpdate = true;
  return { texture };
}

/** `to` names the universe upstairs, the one this office powers. */
export function createPowerLine({ to }) {
  const group = new THREE.Group();

  // The gauge, on the back wall.
  const gauge = new THREE.Group();
  gauge.position.set(X, GAUGE_Y, WALL_Z);
  gauge.add(box(0.86, 0.96, 0.06, '#2a2f29', 0, 0, 0.03));
  const face = gaugeFace(to);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false }));
  plate.position.z = 0.065;
  gauge.add(plate);
  // The needle pivots on the dial's centre (y 250 of 360 on the face).
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.45 - (250 / 360) * 0.9, 0.075);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.25, 0.008), new THREE.MeshBasicMaterial({ color: '#ff5f4a' }));
  needle.position.y = 0.11;
  pivot.add(needle, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 14).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#d9dde2' })));
  gauge.add(pivot);
  group.add(gauge);

  // The conduit: from a junction box on the floor, up behind the gauge, to
  // the top of the wall.
  group.add(box(0.36, 0.3, 0.2, '#3a403a', PIPE_X, 0.15, WALL_Z + 0.1));
  group.add(box(0.2, 0.06, 0.012, '#f2c94c', PIPE_X, 0.2, WALL_Z + 0.205));
  group.add(cyl(0.045, 0.045, 3.3, '#4a5146', 12).translateX(PIPE_X).translateY(1.95).translateZ(WALL_Z + 0.06));
  for (const y of [0.9, 2.1, 3.4]) group.add(box(0.14, 0.04, 0.1, '#6d747e', PIPE_X, y, WALL_Z + 0.05));
  // A lead from the pipe into the gauge.
  group.add(box(0.12, 0.03, 0.03, '#4a5146', PIPE_X + 0.08, GAUGE_Y - 0.3, WALL_Z + 0.06));

  // The cable: off the top of the wall and up to the battery's roof.
  const top = new THREE.Vector3(PIPE_X, 3.62, WALL_Z + 0.06);
  const curve = new THREE.CatmullRomCurve3([
    top,
    new THREE.Vector3(PIPE_X, 4.5, WALL_Z - 0.3),
    new THREE.Vector3(PIPE_X - 0.4, 9, -7.6),
    new THREE.Vector3(PIPE_X - 1.2, 20, -12),
    TERMINAL.clone(),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.12, 8), toon('#2e2a2c')));
  // On the glass: the "+" terminal it plugs into.
  const terminal = new THREE.Group();
  terminal.position.copy(TERMINAL);
  // Facing down, from the roof.
  terminal.rotation.x = Math.PI / 2;
  terminal.add(cyl(1.4, 1.6, 0.8, '#8a9099', 24).rotateX(Math.PI / 2));
  terminal.add(cyl(0.95, 0.95, 0.5, '#e74c3c', 20).rotateX(Math.PI / 2).translateY(0.6));
  const plus = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  terminal.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.26, 0.05), plus).translateZ(0.88));
  terminal.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.1, 0.05), plus).translateZ(0.88));
  group.add(terminal);

  // Sparks of power running up it: the conduit, then the cable.
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new THREE.Vector3(PIPE_X, 0.3, WALL_Z + 0.12), new THREE.Vector3(PIPE_X, 3.62, WALL_Z + 0.12)));
  path.add(curve);
  const sparkMat = new THREE.MeshBasicMaterial({ color: SPARK, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sparkGeo = new THREE.SphereGeometry(1, 10, 8);
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) {
    const s = new THREE.Mesh(sparkGeo, sparkMat);
    s.castShadow = false;
    group.add(s);
    sparks.push(s);
  }
  const length = path.getLength();
  noInk(plate);
  for (const s of sparks) noInk(s);

  let load = 0;
  let shown = 0;
  let along = 0;
  return {
    group,
    /** How hard the office is working, 0 to 1. */
    set(next) {
      load = THREE.MathUtils.clamp(next, 0, 1);
    },
    update(dt, t) {
      shown = THREE.MathUtils.damp(shown, load, 2, dt);
      // The needle settles on the load, with a jitter while it's working.
      pivot.rotation.z = SWEEP / 2 - shown * SWEEP + Math.sin(t * 23) * 0.015 * shown;
      // Metres per second up the line: a trickle when nobody's working.
      along = (along + dt * (0.6 + shown * 7)) % length;
      sparkMat.opacity = 0.35 + shown * 0.65;
      sparks.forEach((s, i) => {
        const u = ((along + (i / SPARKS) * length) % length) / length;
        path.getPointAt(u, s.position);
        // Small on the wall, bigger out on the cable where it's far away.
        s.scale.setScalar(0.06 + u * 0.22);
      });
    },
  };
}
