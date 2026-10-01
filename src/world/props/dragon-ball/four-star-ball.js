import * as THREE from 'three';
import { mesh, noInk, ownToon } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';
import { ballStand } from '../stand.js';

// The four-star Dragon Ball (Dragon Ball): Grandpa Gohan's, the one Goku
// kept on his hat. Orange crystal glowing gold in the middle, four red stars
// floating inside in a skewed square, a bright shine on top. On a little
// black stand.
//
// Origin: the bottom of the stand. Faces +z.

const RADIUS = 0.045;

export function createFourStarBall() {
  const g = new THREE.Group();
  const { stand, seat } = ballStand('#1c1c21', RADIUS);
  g.add(stand);

  const ball = new THREE.Group();
  ball.position.y = seat;
  g.add(ball);
  // The crystal writes no depth, so its glow and stars (always facing you,
  // from inside it) draw over it; anything in front still hides them.
  const crystal = mesh(new THREE.SphereGeometry(RADIUS, 32, 24), ownToon('#f2850f', { emissive: '#b84a00', transparent: true, opacity: 0.93, depthWrite: false }));
  crystal.renderOrder = 1;
  ball.add(crystal);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  core.scale.setScalar(RADIUS * 1.9);
  core.renderOrder = 2;
  ball.add(noInk(core));
  const stars = new THREE.Sprite(new THREE.SpriteMaterial({ map: starsTexture(), transparent: true, depthWrite: false }));
  stars.scale.setScalar(RADIUS * 1.9);
  stars.renderOrder = 3;
  ball.add(noInk(stars));
  const shine = mesh(
    new THREE.SphereGeometry(RADIUS * 1.004, 16, 8, Math.PI * 0.12, Math.PI * 0.24, Math.PI * 0.13, Math.PI * 0.1),
    new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 0.6, depthWrite: false }),
    { cast: false },
  );
  shine.renderOrder = 4;
  ball.add(noInk(shine));
  return g;
}

/** Gold glowing out of the middle, fading to the crystal's orange. */
function coreTexture() {
  const S = 128;
  const { ctx, texture } = canvasTexture(S, S);
  const glow = ctx.createRadialGradient(S * 0.46, S * 0.44, 2, S / 2, S / 2, S / 2);
  glow.addColorStop(0, 'rgba(255, 244, 160, 1)');
  glow.addColorStop(0.5, 'rgba(255, 204, 70, 0.8)');
  glow.addColorStop(0.92, 'rgba(255, 150, 20, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);
  texture.needsUpdate = true;
  return texture;
}

/** Four red stars, each point faceted light and dark like a cut gem. */
function starsTexture() {
  const S = 256;
  const { ctx, texture } = canvasTexture(S, S);
  // Where they float, as fractions of the ball's radius from its middle.
  for (const [x, y] of [[-0.3, -0.24], [0.18, -0.26], [-0.2, 0.24], [0.27, 0.22]]) {
    star(ctx, S / 2 + (x * S) / 2, S / 2 + (y * S) / 2, S * 0.1);
  }
  texture.needsUpdate = true;
  return texture;
}

function star(ctx, x, y, r) {
  const inner = r * 0.45;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    const tip = [x + Math.cos(a) * r, y + Math.sin(a) * r];
    for (const side of [-1, 1]) {
      const b = a + (side * Math.PI) / 5;
      ctx.fillStyle = side < 0 ? '#e8352a' : '#a3140f';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(...tip);
      ctx.lineTo(x + Math.cos(b) * inner, y + Math.sin(b) * inner);
      ctx.closePath();
      ctx.fill();
    }
  }
}
