import * as THREE from 'three';

/**
 * The nearest point to `p` (on the floor) on the path through `points`, back
 * to the start if `closed`: which leg it's on (`k`, from points[k]), how far
 * along that leg (`t`, 0 to 1), and the `point`.
 */
export function nearestOnPath(points, p, closed = false) {
  const flat = new THREE.Vector3(p.x, 0, p.z);
  const legs = closed ? points.length : points.length - 1;
  let best = null;
  for (let k = 0; k < legs; k++) {
    const a = points[k];
    const ab = points[(k + 1) % points.length].clone().sub(a);
    const t = THREE.MathUtils.clamp(flat.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    const point = a.clone().addScaledVector(ab, t);
    const d = point.distanceToSquared(flat);
    if (!best || d < best.d) best = { k, t, point, d };
  }
  return best;
}
