import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mesh, noInk, toon } from '../../engine/toon.js';
import { canvasTexture } from '../screens.js';

// The TV remote Rick flicks through interdimensional cable with: black,
// rows of grey buttons, a red one for power. Click it to change channel;
// its light blinks at the TV.
//
// Origin: the bottom middle, lying flat, its top end (the light) towards +z.

const SIZE = { width: 0.052, height: 0.022, length: 0.2 };

export function createRemote() {
  const g = new THREE.Group();
  const { width: W, height: H, length: L } = SIZE;
  const body = mesh(new RoundedBoxGeometry(W, H, L, 3, 0.009), toon('#1f2124'));
  body.position.y = H / 2;
  g.add(body);
  const keys = mesh(new THREE.PlaneGeometry(W - 0.01, L - 0.016), new THREE.MeshBasicMaterial({ map: keypad(), transparent: true }), { cast: false });
  // Turned so the top of the keypad is at the light end.
  keys.rotation.set(-Math.PI / 2, 0, Math.PI);
  keys.position.y = H + 0.0005;
  g.add(noInk(keys));
  const light = new THREE.MeshBasicMaterial({ color: '#5a1a1a' });
  g.add(mesh(new THREE.SphereGeometry(0.004, 8, 6), light, { cast: false }).translateY(H * 0.6).translateZ(L / 2));
  // Bigger than the remote, so you can hit it from across the room; never drawn.
  const reach = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
  reach.position.y = 0.06;
  g.add(noInk(reach));
  g.traverse((o) => { if (o.isMesh) o.userData.remote = true; });

  let blink = 0;
  return {
    group: g,
    press() {
      blink = 1;
    },
    update(dt) {
      if (blink === 0) return;
      blink = Math.max(0, blink - dt * 2.5);
      light.color.set(blink > 0 && Math.sin(blink * 30) > 0 ? '#ff3b2f' : '#5a1a1a');
      // A little jump, as if pressed hard.
      body.position.y = H / 2 + Math.sin(blink * Math.PI) * 0.004;
    },
  };
}

/** The buttons: power at the top, the round pad, then rows of keys. */
function keypad() {
  const W = 64;
  const H = 256;
  const { ctx, texture } = canvasTexture(W, H);
  const key = (x, y, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Top of the canvas is the light end.
  key(W * 0.75, 18, 6, '#e0473c');
  ctx.strokeStyle = '#8a9099';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(W / 2, 70, 17, 0, Math.PI * 2);
  ctx.stroke();
  key(W / 2, 70, 7, '#8a9099');
  for (let row = 0; row < 7; row++) for (let col = 0; col < 3; col++) key(14 + col * 18, 112 + row * 19, 5.5, '#8a9099');
  texture.needsUpdate = true;
  return texture;
}
