/** Springs past 1 and settles, for popping things in (never quite 0, so it can be a scale). */
export function elasticOut(x) {
  if (x <= 0) return 0.01;
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

/** THREE.MathUtils.damp for an angle: the short way round. */
export function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
