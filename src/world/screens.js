import * as THREE from 'three';
import { STATUS_COLORS, STATUS_LABELS, formatDuration, providerInfo, statusSince } from '../status.js';

// Everything that shows text in the room is a canvas redrawn on demand:
// desk monitors and the neon sign here, the wall TV and the whiteboard in
// their own modules (they share these helpers).

const MONO = '600 17px ui-monospace, "SF Mono", Menlo, monospace';

export function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

export function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= width) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

export function wrap(ctx, text, width, maxLines) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) lines[maxLines - 1] = fit(ctx, lines[maxLines - 1] + (words.length ? ' …' : ''), width);
  return lines.slice(0, maxLines);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ------------------------------------------------------------ desk monitor

export class TerminalScreen {
  constructor() {
    Object.assign(this, canvasTexture(512, 320));
    this.lastKey = '';
    this.drawIdle(0);
  }

  drawIdle(t) {
    const { ctx, canvas } = this;
    const key = `idle:${Math.floor(t * 2)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    ctx.fillStyle = '#0d1014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // A slow, DVD-style bouncing logo.
    const tri = (v, span) => Math.abs((v % (2 * span)) - span);
    ctx.font = '700 26px "Luckiest Guy", ui-rounded, system-ui';
    ctx.fillStyle = '#2f6f8f';
    ctx.fillText('MEESEEKS BOX', 16 + tri(t * 20, canvas.width - 230), 50 + tri(t * 13, canvas.height - 110));
    ctx.font = '500 14px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#39424e';
    ctx.fillText('desk available · press the box', 16, canvas.height - 16);
    this.texture.needsUpdate = true;
  }

  draw(session, visualStatus, now, t) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const blink = Math.floor(t * 2) % 2;
    const last = session.activity[session.activity.length - 1];
    const key = `${session.id}:${visualStatus}:${session.activity.length}:${last?.ts}:${last?.text}:${blink}:${Math.floor(now / 1000)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const p = providerInfo(session.provider);
    ctx.fillStyle = '#12151a';
    ctx.fillRect(0, 0, W, H);

    // Title bar.
    ctx.fillStyle = p.bar;
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = p.text;
    ctx.font = '700 17px ui-monospace, Menlo, monospace';
    ctx.fillText(`${p.glyph} ${p.name}`, 12, 23);
    ctx.textAlign = 'right';
    ctx.font = '600 15px ui-monospace, Menlo, monospace';
    ctx.fillText(fit(ctx, session.project || '', 220), W - 12, 23);
    ctx.textAlign = 'left';

    // Activity log, newest at the bottom like a real terminal.
    ctx.font = MONO;
    const lineH = 22;
    const top = 46;
    const bottom = H - 40;
    const rows = [];
    for (let i = session.activity.length - 1; i >= 0 && rows.length < 12; i--) {
      const a = session.activity[i];
      const color = a.kind === 'prompt' ? '#8ab4f8' : a.kind === 'tool' ? '#e5c07b' : a.kind === 'think' ? '#6b7280' : '#d7dae0';
      const prefix = a.kind === 'prompt' ? '> ' : a.kind === 'tool' ? '⏺ ' : a.kind === 'think' ? '✻ ' : '  ';
      const lines = wrap(ctx, prefix + a.text, W - 28, a.kind === 'tool' || a.kind === 'think' ? 1 : 2);
      for (let j = lines.length - 1; j >= 0; j--) rows.unshift({ text: (j > 0 ? '  ' : '') + lines[j], color });
    }
    const visible = rows.slice(-Math.floor((bottom - top) / lineH));
    visible.forEach((r, i) => {
      ctx.fillStyle = r.color;
      ctx.fillText(r.text, 14, top + 14 + i * lineH);
    });

    // Status line.
    const color = STATUS_COLORS[visualStatus] || '#999';
    ctx.fillStyle = '#1c2027';
    ctx.fillRect(0, H - 32, W, 32);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(18, H - 16, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 15px ui-monospace, Menlo, monospace';
    const since = statusSince(session, visualStatus);
    const label = `${STATUS_LABELS[visualStatus] || visualStatus} · ${formatDuration(now - (since || now))}`;
    ctx.fillText(label, 32, H - 11);
    if ((visualStatus === 'working' || visualStatus === 'stressed') && blink) {
      ctx.fillStyle = '#d7dae0';
      ctx.fillRect(W - 24, H - 24, 10, 16);
    }

    if (visualStatus === 'waiting') {
      ctx.fillStyle = 'rgba(255, 210, 74, 0.92)';
      roundRect(ctx, W / 2 - 150, H / 2 - 30, 300, 52, 10);
      ctx.fill();
      ctx.fillStyle = '#2a2000';
      ctx.font = '800 22px ui-rounded, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('👋 Your turn!', W / 2, H / 2 + 4);
      ctx.textAlign = 'left';
    } else if (visualStatus === 'sleeping') {
      ctx.fillStyle = 'rgba(8, 10, 14, 0.72)';
      ctx.fillRect(0, 34, W, H - 66);
      ctx.fillStyle = '#6d7a8c';
      ctx.font = '800 44px ui-rounded, system-ui';
      ctx.fillText('z', 360 + Math.sin(t) * 6, 130);
      ctx.font = '800 32px ui-rounded, system-ui';
      ctx.fillText('z', 400 + Math.sin(t + 1) * 6, 95);
      ctx.font = '800 22px ui-rounded, system-ui';
      ctx.fillText('z', 428 + Math.sin(t + 2) * 6, 70);
    }
    this.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- neon sign

export function neonSignTexture({ title = 'MEESEEKS BOX', sub = '✦ Existence is pain! ✦', glow = ['#ff4fa3', '#ff79b8'], core = '#ffe3f1' } = {}) {
  const { canvas, ctx, texture } = canvasTexture(1024, 300);
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.font = '120px "Luckiest Guy", "Arial Rounded MT Bold", system-ui';
    for (const [blur, color] of [[40, glow[0]], [18, glow[1]]]) {
      ctx.shadowBlur = blur;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.strokeText(title, 512, 150);
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = core;
    ctx.lineWidth = 3;
    ctx.strokeText(title, 512, 150);
    ctx.font = '600 44px "Patrick Hand", "Marker Felt", system-ui';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#4ff2ff';
    ctx.fillStyle = '#bafcff';
    ctx.fillText(sub, 512, 240);
    texture.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return texture;
}

/** Soft radial blob, used for fake glows behind lights and the portal. */
export function glowTexture(color = '#ffffff') {
  const { canvas, ctx, texture } = canvasTexture(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  texture.needsUpdate = true;
  return texture;
}

export function labelTexture(text, { bg = '#f4efe1', fg = '#2b2b2b', w = 256, h = 64, font = '700 30px "Luckiest Guy", system-ui' } = {}) {
  const { ctx, texture } = canvasTexture(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  texture.needsUpdate = true;
  return texture;
}
