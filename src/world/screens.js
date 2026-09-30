import * as THREE from 'three';
import { STATUS_COLORS, STATUS_LABELS, formatDuration, providerInfo, statusSince } from '../status.js';

// Everything that shows text in the room is a canvas redrawn on demand:
// desk monitors, the wall TV, the whiteboard and the neon sign.

const MONO = '600 17px ui-monospace, "SF Mono", Menlo, monospace';

function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx: canvas.getContext('2d'), texture };
}

function fit(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= width) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

function wrap(ctx, text, width, maxLines) {
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

function roundRect(ctx, x, y, w, h, r) {
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

// ---------------------------------------------------------------- wall TV

export class DashboardScreen {
  constructor() {
    Object.assign(this, canvasTexture(1024, 576));
    this.lastKey = '';
  }

  draw(agents, now, mode) {
    const key = `${Math.floor(now / 1000)}:${agents.length}:${mode}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e2a2f');
    g.addColorStop(1, '#122036');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#97ce4c';
    ctx.font = '800 38px "Luckiest Guy", ui-rounded, system-ui';
    ctx.fillText('MISSION CONTROL', 36, 62);
    ctx.fillStyle = '#6fd3f7';
    ctx.font = '600 20px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), W - 36, 56);
    ctx.fillText(mode === 'offline' ? 'SCANNER OFFLINE' : 'LIVE · C-137', W - 36, 84);
    ctx.textAlign = 'left';

    const count = (s) => agents.filter((a) => a.visualStatus === s).length;
    const tiles = [
      ['WORKING', count('working') + count('stressed'), STATUS_COLORS.working],
      ['NEED YOU', count('waiting'), STATUS_COLORS.waiting],
      ['NAPPING', count('sleeping'), STATUS_COLORS.sleeping],
    ];
    tiles.forEach(([label, n, color], i) => {
      const x = 36 + i * 322;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, x, 104, 300, 132, 16);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = '800 76px ui-rounded, system-ui';
      ctx.fillText(String(n), x + 24, 196);
      ctx.font = '700 22px ui-rounded, system-ui';
      ctx.fillText(label, x + 24, 222);
    });

    const live = agents.filter((a) => a.visualStatus !== 'leaving');
    const oldest = [...live].sort((a, b) => a.session.startedAt - b.session.startedAt)[0];
    ctx.font = '600 21px ui-rounded, system-ui';
    ctx.fillStyle = '#c9d3df';
    if (oldest) {
      const age = now - oldest.session.startedAt;
      const suffix = age > 3_600_000 ? '  — existence is pain' : '';
      ctx.fillText(fit(ctx, `Oldest Meeseeks: ${oldest.session.project} · alive ${formatDuration(age)}${suffix}`, W - 72), 36, 276);
    } else {
      ctx.fillText('No Meeseeks summoned. Press the box to make one!', 36, 276);
    }

    // Combined activity feed.
    const feed = [];
    for (const a of live) for (const e of a.session.activity.slice(-6)) if (e.kind !== 'think') feed.push({ ...e, project: a.session.project, color: a.colorHex });
    feed.sort((a, b) => b.ts - a.ts);
    ctx.font = '500 19px ui-monospace, Menlo, monospace';
    feed.slice(0, 9).forEach((e, i) => {
      const y = 322 + i * 27;
      ctx.fillStyle = e.color;
      ctx.fillRect(36, y - 15, 8, 18);
      ctx.fillStyle = '#7f8ea3';
      const project = fit(ctx, e.project, 180);
      ctx.fillText(project, 56, y);
      ctx.fillStyle = '#e6edf5';
      ctx.fillText(fit(ctx, `${e.icon || ''} ${e.text}`, W - 290), 250, y);
    });
    this.texture.needsUpdate = true;
  }
}

// ------------------------------------------------------------- whiteboard

const STATIC_TODO = ["Get 2 strokes off Jerry's golf game", 'Find more Szechuan sauce', 'Raise Series A (Council of Ricks?)', 'Fix portal fluid leak'];

export class Whiteboard {
  constructor() {
    Object.assign(this, canvasTexture(1024, 560));
    this.lastKey = '';
  }

  draw(agents, done) {
    const doing = agents.filter((a) => a.visualStatus === 'working' || a.visualStatus === 'stressed').map((a) => a.session.title);
    const waiting = agents.filter((a) => a.visualStatus === 'waiting').map((a) => a.session.title);
    const key = JSON.stringify([doing, waiting, done.slice(-4)]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#f6f6f0';
    ctx.fillRect(0, 0, W, H);

    const marker = (size) => `${size}px "Permanent Marker", "Patrick Hand", "Marker Felt", "Comic Sans MS", cursive`;
    ctx.fillStyle = '#2b4c7e';
    ctx.font = marker(40);
    ctx.fillText('SPRINT ∞', 28, 54);
    ctx.fillStyle = '#c0392b';
    ctx.font = marker(22);
    ctx.fillText('ship it or get schwifty', 260, 50);

    const cols = [
      ['TODO', STATIC_TODO, '#fff3a8'],
      ['DOING', doing, '#bfe6ff'],
      ['NEEDS YOU', waiting, '#ffc7d9'],
      ['DONE ✨', done.slice(-4).reverse(), '#c9f2b5'],
    ];
    const colW = (W - 40) / cols.length;
    cols.forEach(([title, items, color], i) => {
      const x = 20 + i * colW;
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 3;
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(x, 80);
        ctx.lineTo(x + 4, H - 20);
        ctx.stroke();
      }
      ctx.fillStyle = '#333';
      ctx.font = marker(26);
      ctx.fillText(title, x + 14, 110);
      items.slice(0, 4).forEach((text, j) => {
        const nx = x + 12 + (j % 2) * 6;
        const ny = 128 + j * 102;
        ctx.save();
        ctx.translate(nx + colW / 2, ny + 44);
        ctx.rotate(((j * 37 + i * 11) % 7 - 3) * 0.012);
        ctx.fillStyle = color;
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 6;
        ctx.fillRect(-colW / 2 + 6, -42, colW - 28, 88);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#2d2d2d';
        ctx.font = marker(19);
        wrap(ctx, text || '???', colW - 48, 3).forEach((l, k) => ctx.fillText(l, -colW / 2 + 16, -14 + k * 24));
        ctx.restore();
      });
    });
    this.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- neon sign

export function neonSignTexture() {
  const { canvas, ctx, texture } = canvasTexture(1024, 300);
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.font = '120px "Luckiest Guy", "Arial Rounded MT Bold", system-ui';
    for (const [blur, color] of [[40, '#ff4fa3'], [18, '#ff79b8']]) {
      ctx.shadowBlur = blur;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.strokeText('MEESEEKS BOX', 512, 150);
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffe3f1';
    ctx.lineWidth = 3;
    ctx.strokeText('MEESEEKS BOX', 512, 150);
    ctx.font = '600 44px "Patrick Hand", "Marker Felt", system-ui';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#4ff2ff';
    ctx.fillStyle = '#bafcff';
    ctx.fillText('✦ existence is pain · we are hiring ✦', 512, 240);
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
