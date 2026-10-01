import * as THREE from 'three';

// Outlines more than one prop is cut from.

/** A `w` by `d` rectangle with corners rounded to `r`, centred on 0. */
export function roundedRect(w, d, r) {
  const x = w / 2;
  const y = d / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}
