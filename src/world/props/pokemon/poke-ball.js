import * as THREE from 'three';
import { cyl, mesh, noInk, sphere, toon } from '../../../engine/toon.js';
import { ballStand } from '../stand.js';

// A Poké Ball (Pokémon): red on top, white underneath, the black band round
// its middle and the white button in a black ring at the front. Sat on a
// little stand, tipped back a touch so the button looks up at you.
//
// Origin: the bottom of the stand. Faces +z.

const RADIUS = 0.045;

export function createPokeBall() {
  const g = new THREE.Group();
  const { stand, seat } = ballStand('#33363d', RADIUS);
  g.add(stand);

  const ball = new THREE.Group();
  ball.position.y = seat;
  ball.rotation.set(-0.28, 0.12, 0);
  g.add(ball);
  const half = (color, from) => mesh(new THREE.SphereGeometry(RADIUS, 36, 14, 0, Math.PI * 2, from, Math.PI / 2), toon(color));
  ball.add(half('#e3262e', 0), half('#f3f3f1', Math.PI / 2));

  // The band: 5mm on the real 7.6cm ball.
  const black = toon('#1d1d20');
  ball.add(cyl(RADIUS * 1.006, RADIUS * 1.006, RADIUS * 0.14, black, 48));
  // The button, in its ring, with the faint line round its face.
  const front = new THREE.Group();
  front.rotation.x = Math.PI / 2;
  front.position.z = RADIUS * 0.94;
  ball.add(front);
  front.add(cyl(RADIUS * 0.33, RADIUS * 0.33, RADIUS * 0.16, black, 28).translateY(RADIUS * 0.06));
  front.add(cyl(RADIUS * 0.21, RADIUS * 0.22, RADIUS * 0.1, '#f7f7f5', 28).translateY(RADIUS * 0.17));
  const ring = mesh(new THREE.RingGeometry(RADIUS * 0.12, RADIUS * 0.135, 28), new THREE.MeshBasicMaterial({ color: '#9aa0a8' }), { cast: false });
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = RADIUS * 0.221;
  front.add(noInk(ring));
  // A shine on the red.
  const shine = sphere(RADIUS * 0.16, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }), 12, { cast: false });
  shine.scale.set(1, 0.55, 0.25);
  shine.position.set(-RADIUS * 0.42, RADIUS * 0.62, RADIUS * 0.62);
  shine.lookAt(shine.position.clone().multiplyScalar(2));
  ball.add(noInk(shine));
  return g;
}
