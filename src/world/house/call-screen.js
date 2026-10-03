import * as THREE from 'three';
import { dampAngle, elasticOut } from '../../engine/motion.js';
import { box, cyl, glow, mesh, noInk, sphere } from '../../engine/toon.js';
import { STATUS_COLORS, STATUS_LABELS } from '../../status.js';
import { Board } from '../board.js';
import { fit, roundRect } from '../screens.js';

// During a meeting, agents in the other universes (the garage, or the
// Microverse and deeper in the car battery) join on floating TVs at the head
// of the table: one per universe, a tile per agent with its face, project
// and status. Click a tile to go and see that agent where it is.

const ROUND = 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
const INK = '#171311';
const MUTED = '#9fb0c3';
/** The screen, in metres; the canvas has the same shape. */
const SCREEN = { w: 1.36, h: 0.85 };
const MAX_SCREENS = 3;
const { damp } = THREE.MathUtils;

/** A universe on the call: one floating TV. */
class CallBoard extends Board {
  constructor() {
    super(1024, 640);
  }

  /** `call` is { level, name, color, agents } with agents as the multiverse roster lists them. */
  draw(call, now) {
    const blink = Math.floor(now / 1000) % 2;
    const key = JSON.stringify([call.level, call.name, blink, call.agents.map((a) => [a.id, a.kind, a.colorHex, a.visualStatus, a.session.project, doing(a)])]);
    if (!this.begin(key, [call, now])) return;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f1f2c');
    g.addColorStop(1, '#16283b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Title: where they're calling in from, and a blinking LIVE.
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = call.color;
    ctx.font = `400 46px "Luckiest Guy", ${ROUND}`;
    ctx.fillText(fit(ctx, `📡 Live from the ${call.name}`.toUpperCase(), W - 260), 32, 64);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff5b5b';
    ctx.font = `800 26px ${ROUND}`;
    ctx.fillText('LIVE', W - 32, 58);
    if (blink) {
      ctx.beginPath();
      ctx.arc(W - 112, 49, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'left';

    // A tile per agent.
    const n = call.agents.length;
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const X = 24, Y = 92, GAP = 14;
    const tw = (W - 2 * X - (cols - 1) * GAP) / cols;
    const th = Math.min((H - Y - X - (rows - 1) * GAP) / rows, tw * 0.9);
    call.agents.forEach((a, i) => {
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, n - r * cols);
      // The last row, if it's short, is centred.
      const left = X + ((cols - inRow) * (tw + GAP)) / 2;
      this.tile(a, call.name, left + (i % cols) * (tw + GAP), Y + r * (th + GAP), tw, th, now);
    });
    this.texture.needsUpdate = true;
  }

  tile(a, where, x, y, w, h, now) {
    const { ctx } = this;
    const s = a.session;
    const name = s.project || s.title;
    const status = a.visualStatus;
    const action = { id: `call:${a.id}`, kind: 'agent', agentId: a.id, label: `${name} · ${STATUS_LABELS[status] || status}\nin the ${where} · click to go there` };
    const hot = this.isHovered(action);
    ctx.fillStyle = tint(a.colorHex, hot ? 0.32 : 0.16);
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = a.colorHex;
    ctx.lineWidth = hot ? 6 : 3;
    ctx.stroke();

    // Wide tiles have the face on the left, tall ones on top.
    const wide = w / h > 1.45;
    const size = Math.min(wide ? h * 0.36 : h * 0.24, w * 0.22);
    const cx = wide ? x + 22 + size * 1.15 : x + w / 2;
    const cy = wide ? y + h / 2 : y + 16 + size * 1.3;
    drawFace(ctx, a.kind, a.colorHex, status, cx, cy, size);

    const tx = wide ? cx + size * 1.4 + 14 : x + 14;
    const tw = wide ? x + w - 14 - tx : w - 28;
    const fs = Math.round(THREE.MathUtils.clamp(h * 0.14, 18, 34));
    let ty = wide ? y + h / 2 - fs * 0.6 : cy + size * 1.25 + fs;
    ctx.textAlign = wide ? 'left' : 'center';
    const ax = wide ? tx : x + w / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${fs}px ${ROUND}`;
    ctx.fillText(fit(ctx, name, tw), ax, ty);
    ty += fs * 1.15;
    ctx.fillStyle = STATUS_COLORS[status] || MUTED;
    ctx.font = `800 ${Math.round(fs * 0.8)}px ${ROUND}`;
    ctx.fillText(fit(ctx, STATUS_LABELS[status] || status, tw), ax, ty);
    if (h > 150) {
      ty += fs * 1.05;
      ctx.fillStyle = MUTED;
      ctx.font = `600 ${Math.round(fs * 0.72)}px ${ROUND}`;
      ctx.fillText(fit(ctx, doing(a), tw), ax, ty);
    }
    ctx.textAlign = 'left';
    this.region(x, y, w, h, action);
  }
}

function doing(a) {
  const s = a.session;
  if (a.visualStatus === 'sleeping') return 'zzz…';
  const last = s.activity.findLast((e) => e.kind !== 'think') || s.activity.at(-1);
  return last ? `${last.icon || ''} ${last.text}`.trim() : s.title;
}

function tint(hex, alpha) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}

function shade(hex, l) {
  return `#${new THREE.Color(hex).offsetHSL(0, 0, l).getHexString()}`;
}

/** The mascot's face, cartoon style, pulling the face its status calls for. */
function drawFace(ctx, kind, color, status, cx, cy, r) {
  const asleep = status === 'sleeping';
  const panic = status === 'stressed';
  const calling = status === 'waiting';
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(3, r * 0.08);
  const outline = () => {
    ctx.fill();
    ctx.stroke();
  };
  const eye = (x, y, rx, ry, look) => {
    if (asleep) {
      ctx.beginPath();
      ctx.arc(x, y, rx, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = '#fbfbf6';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    outline();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y + look, rx * (panic ? 0.22 : 0.42), 0, Math.PI * 2);
    ctx.fill();
  };
  const mouth = (x, y, w) => {
    ctx.fillStyle = '#5c1a22';
    ctx.beginPath();
    if (calling || panic) ctx.ellipse(x, y, w * (panic ? 1.15 : 0.95), w * (panic ? 0.8 : 0.7), 0, 0, Math.PI * 2);
    else if (asleep) ctx.ellipse(x, y, w * 0.32, w * 0.28, 0, 0, Math.PI * 2);
    else {
      ctx.arc(x, y - w * 0.35, w, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      return;
    }
    outline();
  };
  const look = status === 'working' ? r * 0.06 : 0;

  if (kind === 'clawd') {
    // A blocky little critter: square body, nub arms, square eyes.
    ctx.fillStyle = color;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.rect(cx + s * r * 0.95 - r * 0.2, cy - r * 0.05, r * 0.4, r * 0.3);
      outline();
    }
    ctx.beginPath();
    ctx.roundRect(cx - r * 0.85, cy - r * 0.8, r * 1.7, r * 1.55, r * 0.12);
    outline();
    ctx.fillStyle = INK;
    for (const s of [-1, 1]) {
      if (asleep) {
        ctx.fillRect(cx + s * r * 0.36 - r * 0.15, cy - r * 0.2, r * 0.3, r * 0.07);
      } else {
        const ew = panic ? r * 0.28 : r * 0.2;
        ctx.fillRect(cx + s * r * 0.36 - ew / 2, cy - r * 0.38 + look, ew, r * 0.36);
      }
    }
    if (calling || panic) mouth(cx, cy + r * 0.38, r * 0.2);
  } else if (kind === 'butterbot') {
    // A grey dome on a little chassis, one big lens for an eye.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(cx - r * 0.75, cy + r * 0.15, r * 1.5, r * 0.75, r * 0.12);
    outline();
    ctx.fillStyle = '#c9ced6';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.15, r * 0.82, Math.PI, 0);
    ctx.closePath();
    outline();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.3, cy - r * 0.6);
    ctx.lineTo(cx + r * 0.45, cy - r * 1.0);
    ctx.stroke();
    ctx.fillStyle = '#ff5b5b';
    ctx.beginPath();
    ctx.arc(cx + r * 0.45, cy - r * 1.0, r * 0.1, 0, Math.PI * 2);
    outline();
    ctx.fillStyle = '#2b2e33';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.22, r * 0.36, 0, Math.PI * 2);
    outline();
    ctx.fillStyle = asleep ? '#4a5260' : panic ? '#ff6b5b' : calling ? STATUS_COLORS.waiting : '#9fe8ff';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.22 + look, r * (asleep ? 0.1 : 0.18), 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Mr. Meeseeks: big round head, ears, one tuft.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.14, cy - r * 0.97);
    ctx.quadraticCurveTo(cx + r * 0.02, cy - r * 1.42, cx + r * 0.22, cy - r * 1.3);
    ctx.quadraticCurveTo(cx + r * 0.08, cy - r * 1.16, cx + r * 0.16, cy - r * 0.97);
    outline();
    ctx.fillStyle = shade(color, -0.1);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * r * 0.97, cy - r * 0.02, r * 0.16, r * 0.22, 0, 0, Math.PI * 2);
      outline();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    outline();
    for (const s of [-1, 1]) eye(cx + s * r * 0.36, cy - r * 0.16, r * 0.22, r * 0.27, look);
    mouth(cx, cy + r * 0.45, r * 0.28);
  }

  // What it's up to, as a badge.
  const badge = { waiting: '👋', sleeping: '💤', stressed: '💦', working: '⌨️' }[status];
  if (badge) {
    ctx.font = `${Math.round(r * 0.75)}px ${ROUND}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, cx + r * 0.95, cy + r * 0.8);
  }
  ctx.restore();
}

/** One floating TV: a chunky set with antennas, hovering on a green jet. */
class CallScreen {
  constructor() {
    this.board = new CallBoard();
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.scale.setScalar(0.001);
    this.shown = 0;
    this.want = false;
    this.home = new THREE.Vector3();
    const { w, h } = SCREEN;
    const tv = new THREE.Group();
    this.group.add(tv);
    tv.add(box(w + 0.12, h + 0.12, 0.08, '#2b2e33', 0, 0, 0));
    tv.add(box(w * 0.7, h * 0.66, 0.2, '#3a3f47', 0, 0, -0.14));
    for (const s of [-1, 1]) {
      const rod = cyl(0.008, 0.008, 0.36, '#9aa3ab', 6);
      rod.geometry.translate(0, 0.18, 0);
      rod.position.set(s * 0.08, h / 2 + 0.06, -0.06);
      rod.rotation.z = -s * 0.5;
      tv.add(rod);
      tv.add(sphere(0.02, '#9aa3ab', 8).translateX(s * (0.08 + 0.36 * Math.sin(0.5))).translateY(h / 2 + 0.06 + 0.36 * Math.cos(0.5)).translateZ(-0.06));
    }
    tv.add(box(0.12, 0.08, 0.1, '#3a3f47', 0, -h / 2 - 0.1, -0.04));
    const jet = mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 24), glow('#97ce4c'), { cast: false, receive: false });
    jet.rotation.x = Math.PI / 2;
    jet.position.set(0, -h / 2 - 0.16, -0.04);
    tv.add(noInk(jet));
    this.jet = jet;
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.board.texture, toneMapped: false }));
    this.face.position.z = 0.041;
    this.face.userData.board = this.board;
    tv.add(this.face);
  }
}

/**
 * The TVs in the meeting room, side by side: centred on `at`, `step` from
 * one to the next. `set(calls, now)` says who's on (an empty list sends them
 * all away), and returns the ones that got a screen.
 */
export class CallScreens {
  constructor(group, { at, step }) {
    this.parent = group;
    this.at = at;
    this.step = step;
    this.screens = [];
  }

  set(calls, now) {
    const list = calls.slice(0, MAX_SCREENS);
    while (this.screens.length < list.length) {
      const screen = new CallScreen();
      this.parent.add(screen.group);
      this.screens.push(screen);
    }
    this.screens.forEach((screen, i) => {
      const call = list[i];
      screen.want = !!call;
      if (!call) return;
      screen.home = this.at.clone().addScaledVector(this.step, i - (list.length - 1) / 2);
      // A new one pops up where it's going, not sliding in from the middle.
      if (!screen.group.visible) screen.group.position.copy(screen.home);
      screen.board.draw(call, now);
    });
    return list;
  }

  /** Every screen's face, for picking and hovering. */
  faces() {
    return this.screens.map((s) => s.face);
  }

  /** `eye` is where you're looking from: they turn to face it. */
  update(dt, t, eye) {
    for (const [i, s] of this.screens.entries()) {
      s.shown = damp(s.shown, s.want ? 1 : 0, s.want ? 5 : 8, dt);
      const k = s.want ? elasticOut(s.shown) : s.shown;
      s.group.visible = s.shown > 0.01;
      if (!s.group.visible) continue;
      s.group.scale.setScalar(Math.max(0.001, k));
      const p = s.group.position;
      p.x = damp(p.x, s.home.x, 4, dt);
      p.y = s.home.y + Math.sin(t * 1.6 + i * 1.9) * 0.05;
      p.z = damp(p.z, s.home.z, 4, dt);
      if (eye) s.group.rotation.y = dampAngle(s.group.rotation.y, Math.atan2(eye.x - p.x, eye.z - p.z), 4, dt);
      s.jet.scale.setScalar(1 + Math.sin(t * 14 + i) * 0.12);
    }
  }
}
