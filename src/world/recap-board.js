import { agentColor } from '../characters/index.js';
import { formatDuration, testSummary } from '../status.js';
import { Board } from './board.js';
import { fit, wrap } from './screens.js';

// The whiteboard is today's recap. Top: a sticky note per project with what
// changed (git), commits, the last test run and the agent's own recap.
// Bottom: a timeline of every session's turns, with the gaps where it sat
// waiting on you. Click a note, a row or a turn to open the details.

const MARKER = '"Permanent Marker", "Marker Felt", "Comic Sans MS", cursive';
const HAND = '"Patrick Hand", "Marker Felt", "Comic Sans MS", cursive';
const INK = '#2d2d2d';
const RED = '#c0392b';
const NOTE_COLORS = ['#fff3a8', '#bfe6ff', '#ffc7d9', '#c9f2b5'];
const MAX_NOTES = 4;
const MAX_ROWS = 5;
const HOUR = 3_600_000;
const NAP_MS = 15 * 60_000;

const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const num = (n) => Number(n || 0).toLocaleString();
/** Short counts for the sticky notes: 812, 1.6k, 135k. */
const short = (n) => (n < 1000 ? String(n || 0) : n < 10_000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`);

const colorOf = (s) => `#${agentColor(s.provider, s.id).getHexString()}`;

export class RecapBoard extends Board {
  constructor() {
    super(1536, 853);
  }

  draw(today, agents, now) {
    const status = new Map(agents.filter((a) => a.phase !== 'gone').map((a) => [a.id, a.visualStatus]));
    const key = `${today?.now}|${[...status].join(',')}|${Math.floor(now / 30_000)}`;
    if (!this.begin(key, [today, agents, now])) return;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#f6f6f0';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2b4c7e';
    ctx.font = `52px ${MARKER}`;
    ctx.fillText('TODAY', 40, 72);
    const tw = ctx.measureText('TODAY').width;
    ctx.fillStyle = RED;
    ctx.font = `30px ${MARKER}`;
    ctx.fillText(new Date(now).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), 40 + tw + 24, 68);

    if (!today) {
      ctx.fillStyle = '#777';
      ctx.font = `30px ${HAND}`;
      ctx.fillText('Reading today’s transcripts…', 40, 160);
      this.texture.needsUpdate = true;
      return;
    }

    const projects = today.projects;
    const sessions = today.sessions.filter((s) => s.turns.length);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#777';
    ctx.font = `24px ${HAND}`;
    const hidden = projects.length - MAX_NOTES;
    ctx.fillText(hidden > 0 ? `+${hidden} more project${hidden > 1 ? 's' : ''} (see the timeline)` : 'ship it or get schwifty', W - 40, 64);
    ctx.textAlign = 'left';

    if (!projects.length) {
      ctx.fillStyle = '#777';
      ctx.font = `34px ${HAND}`;
      ctx.fillText('No agent work yet today. The day is young.', 40, 200);
    }
    const noteW = (W - 80 - 3 * 22) / 4;
    projects.slice(0, MAX_NOTES).forEach((p, i) => this.note(p, i, 40 + i * (noteW + 22), 96, noteW, 322, today, now));

    this.timeline(sessions, status, 40, 446, W - 80, H - 446 - 16, today, now);
    this.texture.needsUpdate = true;
  }

  note(p, i, x, y, w, h, today, now) {
    const { ctx } = this;
    const action = { id: `project:${p.key}`, kind: 'project', key: p.key, label: `${p.name} · open today’s recap` };
    const hot = this.isHovered(action);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(((i * 37) % 7 - 3) * 0.004);
    ctx.translate(-w / 2, -h / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = NOTE_COLORS[i % NOTE_COLORS.length];
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(w / 2 - 50, -10, 100, 24); // tape
    if (hot) {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 5;
      ctx.strokeRect(2, 2, w - 4, h - 4);
    }

    ctx.fillStyle = INK;
    ctx.font = `34px ${MARKER}`;
    ctx.fillText(fit(ctx, p.name, w - 36), 18, 54);

    // Who worked on it: one dot per session.
    const members = today.sessions.filter((s) => p.sessionIds.includes(s.id));
    members.slice(0, 10).forEach((s, k) => {
      ctx.fillStyle = colorOf(s);
      ctx.beginPath();
      ctx.arc(26 + k * 22, 78, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.fillStyle = '#555';
    ctx.font = `22px ${HAND}`;
    ctx.fillText(`${members.length} session${members.length === 1 ? '' : 's'}${p.branch ? ` · ${p.branch}` : ''}`, 26 + Math.min(10, members.length) * 22 + 6, 85);

    const lines = [];
    if (p.repo && p.changes) {
      lines.push(p.changes.files ? `✏️ ${num(p.changes.files)} uncommitted · +${short(p.changes.added)} −${short(p.changes.removed)}` : '✏️ nothing uncommitted');
    } else {
      lines.push(p.edited.length ? `✏️ ${p.edited.length} file${p.edited.length === 1 ? '' : 's'} edited` : '✏️ no edits');
    }
    if (p.repo) {
      const n = p.commits.length;
      const add = p.commits.reduce((s, c) => s + c.added, 0);
      const del = p.commits.reduce((s, c) => s + c.removed, 0);
      lines.push(n ? `📦 ${n} commit${n === 1 ? '' : 's'} · +${short(add)} −${short(del)}` : '📦 no commits today');
    } else {
      lines.push('📦 not a git repo');
    }
    const test = testSummary(p.test, now);
    lines.push(test ? { text: `🧪 ${test.text}`, color: test.ok === false ? RED : test.ok ? '#1e7b34' : INK } : { text: '🧪 no test runs today', color: '#888' });
    ctx.font = `26px ${HAND}`;
    lines.forEach((l, k) => {
      const line = typeof l === 'string' ? { text: l, color: INK } : l;
      ctx.fillStyle = line.color;
      ctx.fillText(fit(ctx, line.text, w - 36), 18, 124 + k * 34);
    });

    if (p.recap) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 212);
      ctx.lineTo(w - 18, 212);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#444';
      ctx.font = `22px ${HAND}`;
      wrap(ctx, `“${p.recap.text}”`, w - 36, 4).forEach((l, k) => ctx.fillText(l, 18, 240 + k * 24));
    }
    ctx.restore();
    this.region(x, y, w, h, action);
  }

  timeline(sessions, status, x, y, w, h, today, now) {
    const { ctx } = this;
    const rows = sessions.slice(0, MAX_ROWS);
    const labelW = 270;
    const xa = x + labelW, xb = x + w - 10;

    const firstStart = Math.min(...rows.flatMap((s) => s.turns.map((t) => t.start)), now);
    let t0 = Math.max(today.since, Math.floor(firstStart / HOUR) * HOUR);
    if (now - t0 < 2 * HOUR) t0 = Math.max(today.since, Math.floor((now - 2 * HOUR) / HOUR) * HOUR);
    const t1 = now + (now - t0) * 0.02;
    const at = (ts) => xa + ((Math.max(t0, Math.min(t1, ts)) - t0) / (t1 - t0)) * (xb - xa);

    // Hour grid.
    const span = (t1 - t0) / HOUR;
    const step = span <= 8 ? 1 : span <= 16 ? 2 : 3;
    ctx.font = `20px ${MARKER}`;
    ctx.textAlign = 'center';
    for (let t = Math.ceil(t0 / HOUR) * HOUR; t <= t1; t += step * HOUR) {
      const hx = at(t);
      ctx.fillStyle = '#777';
      ctx.fillText(new Date(t).toLocaleTimeString([], { hour: 'numeric' }), hx, y + 18);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, y + 28);
      ctx.lineTo(hx, y + h);
      ctx.stroke();
    }
    ctx.textAlign = 'left';

    if (!rows.length) {
      ctx.fillStyle = '#888';
      ctx.font = `28px ${HAND}`;
      ctx.fillText('Turns will show up here as agents work.', xa, y + 90);
    }

    const top = y + 36;
    const rowH = Math.min(68, (h - 40) / Math.max(1, rows.length));
    rows.forEach((s, r) => {
      const ry = top + r * rowH;
      const color = colorOf(s);
      const live = status.get(s.id);
      const label = live
        ? { id: `agent:${s.id}`, kind: 'agent', agentId: s.id, label: `${s.project} · go to agent` }
        : { id: `session:${s.id}`, kind: 'project', key: s.projectKey, focus: { sessionId: s.id }, label: `${s.title} · ended` };
      const hotLabel = this.isHovered(label);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 10, ry + 20, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = hotLabel ? RED : INK;
      ctx.font = `24px ${MARKER}`;
      ctx.fillText(fit(ctx, s.project, labelW - 40), x + 28, ry + 28);
      ctx.fillStyle = hotLabel ? RED : '#666';
      ctx.font = `21px ${HAND}`;
      ctx.fillText(fit(ctx, `${live ? '' : '(ended) '}${s.title}`, labelW - 40), x + 28, ry + 52);
      this.region(x, ry, labelW - 8, rowH - 4, label);

      const midY = ry + 30;
      const dash = (from, to, c) => {
        if (at(to) - at(from) < 6) return;
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(at(from), midY);
        ctx.lineTo(at(to), midY);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      // A gap between turns is time the agent sat waiting on you.
      const gap = (from, to) => {
        dash(from, Math.min(to, from + NAP_MS), '#e0a800');
        if (to - from > NAP_MS) dash(from + NAP_MS, to, '#b5b5b5');
      };

      s.turns.forEach((t, i) => {
        const open = !t.done && i === s.turns.length - 1;
        const end = open && (live === 'working' || live === 'stressed') ? now : t.end;
        if (i > 0) gap(s.turns[i - 1].end, t.start);
        const bx = at(t.start);
        const bw = Math.max(5, at(end) - bx);
        const action = {
          id: `turn:${s.id}:${i}`,
          kind: 'project',
          key: s.projectKey,
          focus: { sessionId: s.id, turn: i },
          label: `${clock(t.start)}–${open && end === now ? 'now' : clock(end)} · ${formatDuration(end - t.start)}\n${t.prompt || '(no prompt)'}`,
        };
        const hot = this.isHovered(action);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(bx, ry + 14, bw, 32, 6);
        ctx.fill();
        ctx.strokeStyle = hot ? RED : INK;
        ctx.lineWidth = hot ? 4 : 2;
        ctx.stroke();
        this.region(bx - 4, ry + 8, Math.max(14, bw + 8), 44, action);
      });
      const last = s.turns.at(-1);
      if (last && (live === 'waiting' || live === 'sleeping')) gap(last.end, now);
    });

    if (sessions.length > rows.length) {
      ctx.fillStyle = '#777';
      ctx.font = `22px ${HAND}`;
      ctx.fillText(`+${sessions.length - rows.length} more session${sessions.length - rows.length > 1 ? 's' : ''} today`, x + 28, y + h - 4);
    }

    // Now.
    const nx = at(now);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(nx, y + 28);
    ctx.lineTo(nx, y + h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
