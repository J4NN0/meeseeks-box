// Elvish lettering for the props that carry it (Andúril's plaque, the Ring).
// Not real Tengwar, only its look: Fëanor's letters are a stem that rises
// or drops, one or two bows off it, and accents (tehtar) floating above.

/**
 * One letter at `x, y` (the left of its baseline), `size` pixels tall
 * without its stem. Uses the context's stroke and fill style, and returns
 * how far along the next letter goes.
 */
export function tengwa(ctx, x, y, r, size = 10) {
  const s = size;
  ctx.lineWidth = Math.max(1.2, s * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const stem = r();
  ctx.moveTo(x, stem < 0.3 ? y - s * 1.9 : y - s);
  ctx.lineTo(x, stem > 0.75 ? y + s * 0.9 : y);
  const bows = r() < 0.35 ? 2 : 1;
  for (let i = 0; i < bows; i++) {
    const x0 = x + i * s * 0.7;
    ctx.moveTo(x0, y - s);
    ctx.bezierCurveTo(x0 + s, y - s * 1.05, x0 + s, y + s * 0.05, x0 + (r() < 0.5 ? 0 : s * 0.2), y);
  }
  ctx.stroke();

  const t = r();
  const ax = x + s * 0.45;
  ctx.beginPath();
  if (t < 0.3) {
    ctx.arc(ax, y - s * 1.55, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else if (t < 0.5) {
    ctx.moveTo(ax - s * 0.2, y - s * 1.35);
    ctx.lineTo(ax + s * 0.3, y - s * 1.8);
    ctx.stroke();
  } else if (t < 0.62) {
    ctx.arc(ax, y - s * 1.35, s * 0.3, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  return s * (bows === 2 ? 1.75 : 1.05) + s * 0.4;
}

/** Letters from `x` until `width` is filled. */
export function tengwarLine(ctx, x, y, width, r, size = 10) {
  for (let at = x; at < x + width - size * 1.4;) at += tengwa(ctx, at, y, r, size);
}
