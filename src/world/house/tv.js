import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, glow, mesh, noInk, rng, sphere, toon } from '../../engine/toon.js';
import { canvasTexture } from '../screens.js';

// The Smiths' TV: a flat screen on a pedestal, on the light-wood console
// (the DVD player in one end, the DVDs in the other), and beside it Rick's
// interdimensional cable box, the pink crystal sticking out of its top.
// Nothing's on yet: every channel is snow. Changing channel blinks the
// screen to black and back in rolling bands, and puts the channel number up
// in the corner.
//
// Origin: the bottom middle of the console. Faces +z.

export const CONSOLE = { width: 1.9, depth: 0.46, height: 0.52 };
const SCREEN = { width: 1.16, height: 0.655 };
const BEZEL = 0.035;
/** The screen's middle, above the console top. */
const SCREEN_Y = 0.1 + BEZEL + SCREEN.height / 2;
const CHANNELS = 99;
const OSD = { w: 256, h: 144, seconds: 3 };
/** Changing channel, the screen is black while `tuning` is above this. */
const BLANK = 0.76;

export function createTv() {
  const g = new THREE.Group();
  g.add(stand());

  const tv = new THREE.Group();
  tv.position.y = CONSOLE.height;
  g.add(tv);
  const black = toon('#24282c');
  tv.add(box(0.38, 0.02, 0.22, black, 0, 0.01, 0));
  tv.add(box(0.07, 0.1, 0.04, black, 0, 0.06, -0.03));
  tv.add(box(SCREEN.width + BEZEL * 2, SCREEN.height + BEZEL * 2, 0.05, '#2b3035', 0, SCREEN_Y, 0));
  tv.add(box(0.8, 0.45, 0.05, black, 0, SCREEN_Y - 0.03, -0.045));
  const material = snowMaterial();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), material);
  screen.position.set(0, SCREEN_Y, 0.0255);
  tv.add(screen);
  const osd = channelNumber();
  osd.mesh.position.set(0, SCREEN_Y, 0.026);
  tv.add(noInk(osd.mesh));
  // The room flickers in its light.
  const light = new THREE.PointLight('#dfe8ff', 1.2, 4.2, 1.8);
  light.position.set(0, SCREEN_Y, 0.7);
  tv.add(light);
  tv.traverse((o) => { if (o.isMesh) o.userData.livingTv = true; });

  g.add(cableBox());

  let channel = 1;
  let tuning = 0;
  let shown = 0;
  return {
    group: g,
    get channel() { return channel; },
    /** Up a channel, round to 1 after the last. */
    next() {
      channel = (channel % CHANNELS) + 1;
      tuning = 1;
      shown = OSD.seconds;
      osd.draw(channel);
    },
    update(dt, t) {
      tuning = Math.max(0, tuning - dt * 2);
      shown = Math.max(0, shown - dt);
      material.uniforms.time.value = t % 1000;
      material.uniforms.tuning.value = tuning;
      osd.mesh.material.opacity = Math.min(1, shown / 0.4);
      light.intensity = (tuning > BLANK ? 0.2 : 1.0 + tuning * 0.6) * (0.8 + 0.2 * Math.random());
    },
  };
}

/**
 * Snow: fresh grain every frame, a darker band rolling down, faint
 * scanlines. `tuning` is 1 just after changing channel, easing to 0: the
 * screen goes black but for a bright line across its middle, then the snow
 * comes back in rolling bands of light and dark that settle.
 */
function snowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, tuning: { value: 0 } },
    defines: { BLANK: BLANK.toFixed(2) },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float tuning;
      varying vec2 vUv;

      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        float frame = mod(floor(time * 24.0), 997.0);
        float v = hash(floor(vUv * vec2(200.0, 113.0)) + frame * vec2(7.13, 3.71));
        float roll = fract(vUv.y + time * 0.18);
        v *= 1.0 - 0.35 * smoothstep(0.0, 0.08, roll) * (1.0 - smoothstep(0.16, 0.3, roll));
        v *= 0.9 + 0.1 * sin(vUv.y * 6.2832 * 113.0);
        float bands = hash(vec2(floor(vUv.y * 14.0 + time * 30.0), frame));
        v *= mix(1.0, 0.15 + 1.6 * bands, tuning);
        if (tuning > BLANK) v = smoothstep(0.025, 0.0, abs(vUv.y - 0.5)) * (1.0 - smoothstep(0.42, 0.5, abs(vUv.x - 0.5)));
        vec2 d = vUv - 0.5;
        v *= 1.0 - dot(d, d) * 0.9;
        vec3 color = vec3(v) * vec3(0.9, 0.95, 1.0);
        gl_FragColor = vec4(color * color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** The channel number, top right in green, as TVs do. */
function channelNumber() {
  const { canvas, ctx, texture } = canvasTexture(OSD.w, OSD.h);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.width, SCREEN.height), material);
  return {
    mesh: plane,
    draw(n) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '700 30px ui-monospace, "SF Mono", Menlo, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      const text = `CH ${String(n).padStart(2, '0')}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#0b2a0b';
      ctx.strokeText(text, OSD.w - 14, 12);
      ctx.fillStyle = '#7dff7a';
      ctx.fillText(text, OSD.w - 14, 12);
      texture.needsUpdate = true;
    },
  };
}

/** The light-wood console: the DVD player, two cupboard doors, the DVDs. */
function stand() {
  const g = new THREE.Group();
  const { width: W, depth: D, height: H } = CONSOLE;
  const front = D / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.05, 0.06, 0.05, '#8a6a45', sx * (W / 2 - 0.06), 0.03, sz * (D / 2 - 0.06)));
  g.add(box(W, H - 0.09, D, '#d4b07c', 0, (H - 0.09) / 2 + 0.06, 0));
  g.add(box(W + 0.04, 0.03, D + 0.02, '#c9a36d', 0, H - 0.015, 0));
  const hole = toon('#3b2c1f');
  // The open end with the DVD player in it.
  g.add(box(0.52, 0.3, 0.01, hole, -0.62, 0.28, front + 0.002));
  g.add(box(0.44, 0.07, 0.03, '#1c1e21', -0.62, 0.2, front + 0.012));
  g.add(box(0.1, 0.02, 0.005, glow('#4fd2ff'), -0.52, 0.205, front + 0.028));
  // The cupboard doors.
  for (const x of [-0.16, 0.2]) {
    g.add(box(0.34, 0.33, 0.014, '#c9a36d', x, 0.28, front + 0.007));
    g.add(sphere(0.012, '#7a5a3a', 8).translateX(x + (x < 0 ? 0.13 : -0.13)).translateY(0.28).translateZ(front + 0.02));
  }
  // The other end, full of DVDs.
  g.add(box(0.48, 0.33, 0.01, hole, 0.64, 0.28, front + 0.002));
  const r = rng(3);
  const cases = [];
  const colors = ['#c0392b', '#2980b9', '#f2c94c', '#27ae60', '#8e44ad', '#ecf0f1', '#2c3e50', '#e67e22'];
  for (let x = 0.42; x < 0.85; x += 0.022) {
    const h = 0.18 + r() * 0.03;
    const c = new THREE.BoxGeometry(0.016, h, 0.13);
    c.translate(x, 0.13 + h / 2, front - 0.06);
    const color = new THREE.Color(colors[Math.floor(r() * colors.length)]);
    const tint = new Float32Array(c.attributes.position.count * 3);
    for (let i = 0; i < tint.length; i += 3) color.toArray(tint, i);
    c.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    cases.push(c);
  }
  g.add(mesh(mergeGeometries(cases), toon('#ffffff', { vertexColors: true })));
  for (const c of cases) c.dispose();
  return g;
}

/** Rick's interdimensional cable box: a black box, the crystal in its top. */
function cableBox() {
  const g = new THREE.Group();
  g.position.set(-0.72, CONSOLE.height, 0.06);
  g.add(box(0.26, 0.06, 0.2, '#1c1e21', 0, 0.03, 0));
  g.add(box(0.012, 0.008, 0.004, glow('#7ae582'), 0.09, 0.03, 0.101));
  const pink = glow('#ff7ad9');
  for (const [x, z, h, tilt] of [[0, 0, 0.09, 0], [0.025, 0.02, 0.055, 0.5], [-0.022, 0.015, 0.05, -0.55]]) {
    const crystal = mesh(new THREE.OctahedronGeometry(0.022, 0), pink, { cast: false });
    crystal.scale.set(1, h / 0.044, 1);
    crystal.position.set(x, 0.06 + h * 0.35, z);
    crystal.rotation.z = tilt;
    g.add(crystal);
  }
  // Cables round the back to the TV.
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, 0.03, -0.1),
    new THREE.Vector3(0.1, 0.01, -0.17),
    new THREE.Vector3(0.4, 0.01, -0.18),
    new THREE.Vector3(0.62, 0.15, -0.09),
  ]);
  g.add(mesh(new THREE.TubeGeometry(cable, 16, 0.006, 5), toon('#1c1e21')));
  return g;
}
