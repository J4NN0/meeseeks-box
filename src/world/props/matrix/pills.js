import * as THREE from 'three';
import { mesh, noInk, toon } from '../../../engine/toon.js';
import { roundedRect } from '../shapes.js';

// The red pill and the blue pill (The Matrix): two glossy gel capsules in
// Morpheus's little silver case, lid open, the way he offers them to Neo.
// Blue on your left ("the story ends"), red on your right ("you stay in
// Wonderland").
//
// Origin: the bottom of the case. Faces +z.

const SILVER = '#959daa';
const VELVET = '#1b1a20';
const CASE = { width: 0.14, depth: 0.08, base: 0.016, lid: 0.011, corner: 0.02 };

export function createPills() {
  const g = new THREE.Group();
  const silver = toon(SILVER);
  const { width: W, depth: D, base, lid, corner } = CASE;
  const bevel = 0.003;
  const top = base + bevel * 2;

  g.add(slab(W, D, corner, base, bevel, silver).translateY(bevel));
  g.add(lining(W, D, corner, top + 0.0006, 1));

  // The lid, hinged at the back and swung open past upright.
  const hinge = new THREE.Group();
  hinge.position.set(0, top, -D / 2);
  hinge.rotation.x = -1.9;
  g.add(hinge);
  const cover = slab(W, D, corner, lid, bevel, silver);
  cover.position.set(0, bevel, D / 2);
  hinge.add(cover);
  const underside = lining(W, D, corner, -0.0006, -1);
  underside.position.z = D / 2;
  hinge.add(underside);

  g.add(pill('#1f5fd6', -0.034, top, 0.25));
  g.add(pill('#d81e27', 0.034, top, -0.2));
  return g;
}

/** A rounded slab `h` thick, lying flat on y = 0. */
function slab(w, d, r, h, bevel, material) {
  const geo = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, d - bevel * 2, r), { depth: h, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  return mesh(geo, material);
}

/** The velvet inside, facing up (`facing` 1) or down (-1) at height `y`. */
function lining(w, d, r, y, facing) {
  const m = mesh(new THREE.ShapeGeometry(roundedRect(w - 0.012, d - 0.012, r - 0.006), 6), toon(VELVET), { cast: false });
  m.rotation.x = -facing * Math.PI / 2;
  m.position.y = y;
  return noInk(m);
}

/** A capsule lying across the case, with a wet-looking shine along it. */
function pill(color, x, y, turn) {
  const radius = 0.013;
  const length = 0.033;
  const g = new THREE.Group();
  g.position.set(x, y + radius * 0.8, 0.004);
  g.rotation.y = turn;
  const body = mesh(new THREE.CapsuleGeometry(radius, length, 6, 16), toon(color));
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const shine = mesh(new THREE.CapsuleGeometry(radius * 0.22, length * 0.8, 4, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }), { cast: false });
  shine.rotation.z = Math.PI / 2;
  shine.scale.set(1, 1, 0.4);
  shine.position.set(0, radius * 0.72, radius * 0.38);
  g.add(noInk(shine));
  return g;
}
