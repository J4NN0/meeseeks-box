import * as THREE from 'three';
import { box, glow, mesh, noInk } from '../../engine/toon.js';
import { Board } from '../board.js';
import { inboxLine } from '../mission-control.js';
import { fit, roundRect } from '../screens.js';

// The flip chart's replacement: a screen in the room showing everyone who
// needs input, including agents calling from another universe.
const PAGE_SIZE = 5;
const WIDTH = 1.55;
const HEIGHT = 1.18;
const FONT = 'Nunito, system-ui, sans-serif';

class AgendaBoard extends Board {
  constructor() {
    super(960, 720);
    this.page = 0;
  }

  pageBy(step) {
    const [agents = [], on = false, now = Date.now()] = this.lastArgs || [];
    const pages = Math.max(1, Math.ceil(agents.filter((a) => a.visualStatus === 'waiting').length / PAGE_SIZE));
    this.page = Math.max(0, Math.min(pages - 1, this.page + step));
    this.lastKey = '';
    this.draw(agents, on, now);
  }

  draw(agents, on, now) {
    const waiting = on ? agents.filter((a) => a.visualStatus === 'waiting')
      .sort((a, b) => (a.session.statusSince || now) - (b.session.statusSince || now)) : [];
    const pages = Math.max(1, Math.ceil(waiting.length / PAGE_SIZE));
    this.page = Math.min(this.page, pages - 1);
    const visible = waiting.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    const key = JSON.stringify([on, this.page, waiting.length, visible.map((a) => [a.id, a.session.project, a.session.title,
      a.where, a.session.statusSince, a.session.ask, a.session.talk?.permission, a.session.lastMessage,
      a.session.activity?.at(-1), Math.floor((now - (a.session.statusSince || now)) / 60000)])]);
    if (!this.begin(key, [agents, on, now])) return;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#102b32');
    bg.addColorStop(1, '#101927');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#c9ee5a';
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText('MEETING AGENDA', 40, 69);
    ctx.textAlign = 'right';
    ctx.fillStyle = on ? '#ffd24a' : '#8fa0b5';
    ctx.font = `800 27px ${FONT}`;
    ctx.fillText(on ? `${waiting.length} NEED YOU` : 'OFFLINE', W - 40, 66);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(40, 91, W - 80, 2);

    if (!on || !waiting.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = on ? '#a9e6aa' : '#aec0c9';
      ctx.font = `800 42px ${FONT}`;
      ctx.fillText(on ? '✓ Everyone is caught up' : 'Ring the bell to start', W / 2, 365);
      ctx.textAlign = 'left';
    } else {
      visible.forEach((a, i) => this.row(a, 40, 111 + i * 106, W - 80, 94, now));
      const back = { id: 'agenda:prev', kind: 'agenda-page', step: -1, label: 'Previous agenda page' };
      const next = { id: 'agenda:next', kind: 'agenda-page', step: 1, label: 'Next agenda page' };
      if (this.page > 0) this.pageButton(back, '‹ PREV', 40, 658, 155, 43);
      if (this.page < pages - 1) this.pageButton(next, 'NEXT ›', W - 195, 658, 155, 43);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fb0c3';
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(`${this.page + 1} / ${pages}`, W / 2, 688);
      ctx.textAlign = 'left';
    }
    this.texture.needsUpdate = true;
  }

  row(a, x, y, w, h, now) {
    const s = a.session;
    const { icon, text } = inboxLine(s);
    const action = { id: `agenda:${a.id}`, kind: 'call-agent', agentId: a.id,
      label: `${s.project || s.title} · waiting in the ${a.where || 'Garage'}\n${text} · click to open chat` };
    ctxRound(this.ctx, x, y, w, h, 14, this.isHovered(action) ? '#394b4c' : '#1c303b');
    this.ctx.fillStyle = a.colorHex;
    this.ctx.fillRect(x, y + 10, 7, h - 20);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = `800 28px ${FONT}`;
    this.ctx.fillText(fit(this.ctx, s.project || s.title, 450), x + 22, y + 37);
    this.ctx.textAlign = 'right';
    this.ctx.fillStyle = '#ffd24a';
    this.ctx.font = `800 20px ${FONT}`;
    this.ctx.fillText(age(s.statusSince, now), x + w - 16, y + 34);
    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = '#9fb0c3';
    this.ctx.font = `700 18px ${FONT}`;
    this.ctx.fillText(fit(this.ctx, a.where || 'Garage', 170), x + 22, y + 65);
    this.ctx.fillStyle = '#e5edf5';
    this.ctx.font = `600 20px ${FONT}`;
    this.ctx.fillText(fit(this.ctx, `${icon} ${text}`, w - 225), x + 205, y + 68);
    this.region(x, y, w, h, action);
  }

  pageButton(action, label, x, y, w, h) {
    ctxRound(this.ctx, x, y, w, h, 10, this.isHovered(action) ? '#547c67' : '#284b51');
    this.ctx.fillStyle = '#e5f9da';
    this.ctx.font = `800 23px ${FONT}`;
    this.ctx.fillText(label, x + 20, y + 30);
    this.region(x, y, w, h, action);
  }
}

function ctxRound(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

function age(ts, now) {
  if (!ts) return 'waiting';
  const minutes = Math.max(0, Math.floor((now - ts) / 60000));
  if (!minutes) return 'just now';
  if (minutes < 60) return `${minutes}m waiting`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h waiting` : `${Math.floor(hours / 24)}d waiting`;
}

export function createAgendaScreen() {
  const board = new AgendaBoard();
  const group = new THREE.Group();
  // A compact freestanding monitor in the flip chart's old corner.
  group.add(box(WIDTH + 0.1, HEIGHT + 0.1, 0.1, '#252e34', 0, 1.55, 0));
  group.add(box(WIDTH + 0.04, HEIGHT + 0.04, 0.025, '#609263', 0, 1.55, 0.057));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), new THREE.MeshBasicMaterial({ map: board.texture, toneMapped: false }));
  face.position.set(0, 1.55, 0.074);
  face.userData.board = board;
  group.add(face);
  group.add(box(0.09, 0.87, 0.11, '#3a3f47', 0, 0.43, -0.03));
  group.add(box(0.8, 0.05, 0.46, '#3a3f47', 0, 0.025, -0.03));
  const light = mesh(new THREE.BoxGeometry(0.25, 0.018, 0.01), glow('#97ce4c'), { cast: false, receive: false });
  light.position.set(0, 2.21, 0.06);
  group.add(noInk(light));
  board.draw([], false, Date.now());
  return { group, face, board, set: (agents, on, now) => board.draw(agents, on, now), pageBy: (step) => board.pageBy(step) };
}
