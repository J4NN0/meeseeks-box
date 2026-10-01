import * as THREE from 'three';
import { cyl, mesh, noInk, ownToon, rng, toon } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';

// The palantír of Orthanc (The Lord of the Rings): a seeing-stone of dark,
// smoky crystal on Saruman's pedestal, black stone with seven fins round it
// and a seven-pointed star cut in its top. Deep in the glass the Eye is
// looking back at whoever looks in, flickering like fire.
//
// Origin: the bottom of the pedestal. Faces +z.

const STONE = '#2a2b31';
const RADIUS = 0.085;
const DRUM = { radius: 0.08, height: 0.085 };
// The ring on the drum's top the stone rests on, wide enough to show round it.
const CUP = { radius: 0.04, tube: 0.006, y: 0.002 };

export function createPalantir() {
  const g = new THREE.Group();
  g.add(pedestal());

  const orb = new THREE.Group();
  orb.position.y = DRUM.height + CUP.y + Math.sqrt((RADIUS + CUP.tube) ** 2 - CUP.radius ** 2);
  g.add(orb);

  // Nearly black glass. It writes no depth, so the Eye (always facing you,
  // from the middle of the stone) draws over it, and anything in front of
  // the stone still hides both.
  const glass = mesh(new THREE.SphereGeometry(RADIUS, 36, 24), ownToon('#ffffff', { map: smokeTexture(), transparent: true, opacity: 0.95, depthWrite: false }));
  glass.renderOrder = 1;
  orb.add(glass);
  const eyeMaterial = new THREE.SpriteMaterial({ map: eyeTexture(), transparent: true, depthWrite: false, toneMapped: false });
  const eye = new THREE.Sprite(eyeMaterial);
  eye.renderOrder = 2;
  orb.add(noInk(eye));
  // A cartoon shine, high on the side the light comes from.
  const shine = mesh(
    new THREE.SphereGeometry(RADIUS * 1.004, 16, 8, Math.PI * 0.1, Math.PI * 0.22, Math.PI * 0.22, Math.PI * 0.1),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }),
    { cast: false },
  );
  shine.renderOrder = 3;
  orb.add(noInk(shine));

  g.userData.update = (dt, t) => {
    eyeMaterial.opacity = 0.78 + 0.12 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 17.1);
    eye.scale.setScalar(RADIUS * (1.05 + 0.05 * Math.sin(t * 2.1)));
  };
  return g;
}

function pedestal() {
  const g = new THREE.Group();
  const stone = toon(STONE);
  const { radius: R, height: H } = DRUM;
  g.add(cyl(R, R, H, stone, 28).translateY(H / 2));
  // Seven fins standing out round the drum, beaten like rough iron.
  const fin = ownToon('#ffffff', { map: hammeredTexture() });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.PI / 14;
    const block = mesh(new THREE.BoxGeometry(0.034, H, 0.028), fin);
    block.position.set(Math.sin(a) * (R + 0.006), H / 2, Math.cos(a) * (R + 0.006));
    block.rotation.y = a;
    g.add(block);
  }
  // The star cut in the top, and the cup the stone sits in.
  const star = mesh(new THREE.CircleGeometry(R * 0.98, 40), new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, depthWrite: false }), { cast: false });
  star.rotation.x = -Math.PI / 2;
  star.position.y = H + 0.0008;
  g.add(noInk(star));
  const cup = mesh(new THREE.TorusGeometry(CUP.radius, CUP.tube, 8, 32), stone);
  cup.rotation.x = Math.PI / 2;
  cup.position.y = H + CUP.y;
  g.add(cup);
  return g;
}

/** Black obsidian with dull grey dimples. */
function hammeredTexture() {
  const { ctx, texture } = canvasTexture(64, 128);
  const r = rng(77);
  ctx.fillStyle = STONE;
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(14, 14, 18, 0.35)' : 'rgba(110, 114, 126, 0.18)';
    ctx.beginPath();
    ctx.ellipse(r() * 64, r() * 128, 3 + r() * 4, 4 + r() * 5, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  texture.needsUpdate = true;
  return texture;
}

/** Two seven-pointed stars, one through the other, cut into the top. */
function starTexture() {
  const S = 256;
  const { ctx, texture } = canvasTexture(S, S);
  ctx.strokeStyle = 'rgba(150, 156, 170, 0.75)';
  ctx.lineWidth = 3;
  for (const [step, turn] of [[2, 0], [3, Math.PI / 7]]) {
    ctx.beginPath();
    for (let i = 0; i <= 7; i++) {
      const a = ((i * step) / 7) * Math.PI * 2 + turn;
      ctx.lineTo(S / 2 + Math.sin(a) * S * 0.44, S / 2 - Math.cos(a) * S * 0.44);
    }
    ctx.stroke();
  }
  texture.needsUpdate = true;
  return texture;
}

/** Inky glass with grey-blue smoke swirling in it. */
function smokeTexture() {
  const W = 256;
  const H = 128;
  const { ctx, texture } = canvasTexture(W, H);
  const r = rng(3019);
  ctx.fillStyle = '#0a0b0f';
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(${50 + r() * 30}, ${56 + r() * 30}, ${84 + r() * 40}, ${0.16 + r() * 0.18})`;
    ctx.lineWidth = 4 + r() * 10;
    ctx.beginPath();
    let x = r() * W;
    let y = 20 + r() * (H - 40);
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      const nx = x + 20 + r() * 40;
      const ny = y + (r() - 0.5) * 50;
      ctx.quadraticCurveTo((x + nx) / 2, y + (r() - 0.5) * 60, nx, ny);
      x = nx;
      y = ny;
    }
    ctx.stroke();
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** The lidless Eye: a fiery iris round a black cat's slit. */
function eyeTexture() {
  const S = 128;
  const { ctx, texture } = canvasTexture(S, S);
  const c = S / 2;
  ctx.save();
  ctx.translate(c, c);
  ctx.scale(1, 0.62);
  const fire = ctx.createRadialGradient(0, 0, 4, 0, 0, c);
  fire.addColorStop(0, '#fff3b0');
  fire.addColorStop(0.3, '#ffb12e');
  fire.addColorStop(0.62, '#ff4a10');
  fire.addColorStop(0.85, 'rgba(160, 20, 0, 0.5)');
  fire.addColorStop(1, 'rgba(120, 0, 0, 0)');
  ctx.fillStyle = fire;
  ctx.beginPath();
  ctx.arc(0, 0, c, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#120400';
  ctx.beginPath();
  ctx.ellipse(c, c, 4.5, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  texture.needsUpdate = true;
  return texture;
}
