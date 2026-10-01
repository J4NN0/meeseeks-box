import * as THREE from 'three';
import { cyl, glow, mesh, noInk, ownToon, sphere, toon } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';

// The neuralyzer (Men in Black): Agent K's chrome memory-wiper, popped open
// and standing in a little holder. A fluted chrome grip with a pocket clip;
// the slide-out top with its three black dials (minutes, hours, weeks), the
// teal "M A F" strip, the YEAR buttons and the red year display; then the
// knurled ring, the red light and the dome that flashes. Look away.
//
// Origin: the bottom of the holder. Faces +z.

const CHROME = '#9aa3b0';
const R = 0.0135;
// Heights up the neuralyzer, from its rounded bottom end.
const GRIP = { from: 0.012, to: 0.12 };
const SLIDE = { from: 0.122, to: 0.19 };
const HOLDER = { radius: 0.032, height: 0.014, sunk: 0.02 };
// The control panel's artwork (its width follows the panel's shape), where on
// it (pixels down) the dials sit, and their radius in metres.
const PANEL = { h: 400, dials: [50, 128, 206], dial: 0.0045 };

export function createNeuralyzer() {
  const g = new THREE.Group();
  const chrome = toon(CHROME);
  g.add(cyl(HOLDER.radius * 0.92, HOLDER.radius, HOLDER.height, '#1b1c20', 28).translateY(HOLDER.height / 2));
  g.add(cyl(R * 1.25, R * 1.3, 0.006, '#1b1c20', 24).translateY(HOLDER.height + 0.003));

  const n = new THREE.Group();
  n.position.y = HOLDER.height - HOLDER.sunk + 0.006;
  g.add(n);

  // The bottom end and the fluted grip.
  const end = sphere(R, chrome, 20);
  end.scale.y = 0.9;
  end.position.y = GRIP.from;
  n.add(end);
  const grip = mesh(fluted(R, GRIP.to - GRIP.from, 20), ownToon('#ffffff', { map: stripes(20) }));
  grip.position.y = (GRIP.from + GRIP.to) / 2;
  n.add(grip);
  n.add(cyl(R * 1.04, R * 1.04, 0.004, chrome, 24).translateY(GRIP.to));
  // The pocket clip down the back.
  const clip = mesh(new THREE.BoxGeometry(0.0045, 0.055, 0.0016), chrome);
  clip.position.set(0, GRIP.to - 0.03, -R - 0.0012);
  n.add(clip);
  n.add(sphere(0.0028, chrome, 8).translateY(GRIP.to - 0.057).translateZ(-R - 0.0012));

  // The slide: flat in front for the controls.
  const flat = R * 0.62;
  const slide = mesh(dShape(R * 0.94, flat, SLIDE.to - SLIDE.from), chrome);
  slide.position.y = SLIDE.from;
  n.add(slide);
  const panelW = 2 * Math.sqrt((R * 0.94) ** 2 - flat ** 2) * 0.92;
  const panelH = SLIDE.to - SLIDE.from - 0.004;
  const panel = mesh(new THREE.PlaneGeometry(panelW, panelH), new THREE.MeshBasicMaterial({ map: panelTexture(panelW, panelH), toneMapped: false }), { cast: false });
  panel.position.set(0, (SLIDE.from + SLIDE.to) / 2, flat + 0.0003);
  n.add(noInk(panel));
  // The dials stand proud of the panel.
  for (const y of PANEL.dials) {
    const dial = cyl(PANEL.dial, PANEL.dial, 0.0028, '#141518', 20);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, SLIDE.from + 0.002 + panelH * (1 - y / PANEL.h), flat + 0.0014);
    n.add(dial);
  }

  // The head: knurled ring, the red light, the dome.
  n.add(mesh(fluted(R * 1.06, 0.01, 36), ownToon('#ffffff', { map: stripes(36) })).translateY(SLIDE.to + 0.005));
  n.add(cyl(R * 0.9, R * 0.9, 0.004, glow('#ff2a2a'), 24).translateY(SLIDE.to + 0.012));
  const dome = mesh(new THREE.SphereGeometry(R * 0.9, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
  dome.position.y = SLIDE.to + 0.014;
  n.add(dome);
  return g;
}

/** A tube with `flutes` shallow grooves down it, centred on its middle. */
function fluted(radius, length, flutes, depth = 0.06) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, flutes * 4, 1, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 - depth * (0.5 - 0.5 * Math.cos(a * flutes));
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Chrome catching the light down every flute: toon shading flattens the
 * grooves themselves, so they're painted on too.
 */
function stripes(count) {
  const { ctx, texture } = canvasTexture(count * 8, 4);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = '#c3c9d2';
    ctx.fillRect(i * 8, 0, 4, 4);
    ctx.fillStyle = '#7f8894';
    ctx.fillRect(i * 8 + 4, 0, 4, 4);
  }
  texture.needsUpdate = true;
  return texture;
}

/** A tube with its front sliced flat at z = `flat`, `length` tall from y = 0. */
function dShape(radius, flat, length) {
  const s = new THREE.Shape();
  const a = Math.acos(flat / radius);
  // Round the back from one end of the flat to the other.
  s.absarc(0, 0, radius, Math.PI / 2 + a - Math.PI, Math.PI / 2 - a + Math.PI, false);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, curveSegments: 24 });
  // Stood up: the extrusion goes up, the flat (at the shape's -y) faces +z.
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Labels and the red LED year, round the dials, for a `width` by `height` panel. */
function panelTexture(width, height) {
  const H = PANEL.h;
  const W = Math.round((H * width) / height);
  const { ctx, texture } = canvasTexture(W, H);
  ctx.fillStyle = '#b3bac4';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2c3036';
  ctx.font = '700 11px system-ui, sans-serif';
  // Under each dial, its unit, clear of the next dial down.
  const below = PANEL.dial * (H / height) + 8;
  PANEL.dials.forEach((y, i) => ctx.fillText(['MINUTES', 'HOURS', 'WEEKS'][i], W / 2, y + below));
  // The teal M A F strip, then the YEAR buttons.
  ctx.fillStyle = '#5fb8b4';
  ctx.fillRect(14, 262, W - 28, 22);
  ctx.fillStyle = '#123c3a';
  ctx.font = '800 18px system-ui, sans-serif';
  ctx.fillText('M  A  F', W / 2, 274);
  ctx.fillStyle = '#2c3036';
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.fillText('YEAR', W / 2, 302);
  for (const x of [22, W - 22]) {
    ctx.fillStyle = '#7d848e';
    ctx.beginPath();
    ctx.arc(x, 302, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // The display: the year it sends you back to.
  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(10, 320, W - 20, 62);
  ctx.fillStyle = '#ff3b2f';
  ctx.shadowColor = '#ff1a10';
  ctx.shadowBlur = 8;
  ctx.font = '700 34px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillText('1997', W / 2, 352);
  texture.needsUpdate = true;
  return texture;
}
