import { STATUS_COLORS, formatDuration } from '../status.js';
import { Board } from './board.js';
import { fit, roundRect, wrap } from './screens.js';

// The wall TV is your inbox: agents waiting on you, longest wait first, with
// what they asked. Click one to fly over to it. Below: who's been idle for a
// while, then usage limits and today's tokens for Claude or Codex (the pills
// switch between them).

const ROUND = 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';
const MUTED = '#8fa0b5';
const MAX_CARDS = 3;
const PROVIDERS = [
  { id: 'claude', label: '✻ Claude', name: 'Claude', color: '#e0875f' },
  { id: 'codex', label: '>_ Codex', name: 'Codex', color: '#6ec6ee' },
];

/** What an agent waiting on you wants: a question, a permission, or its reply. */
export function inboxLine(session) {
  const ask = session.ask;
  if (ask?.kind === 'question') return { icon: '🙋', text: ask.text };
  if (ask?.kind === 'plan') return { icon: '🗺️', text: ask.text };
  if (ask?.kind === 'tool') return { icon: '🔐', text: `Wants to run: ${ask.text}` };
  const said = session.lastMessage?.text || [...session.activity].reverse().find((e) => e.kind === 'say')?.text;
  return { icon: '💬', text: said || 'Finished its turn.' };
}

export function formatTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`;
  return String(n || 0);
}

const clock = (ts, opts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...opts });

function formatReset(ts, now) {
  if (!ts || ts <= now) return 'window reset';
  if (ts - now < 20 * 3_600_000) return `resets ${clock(ts)}`;
  return `resets ${new Date(ts).toLocaleDateString([], { weekday: 'short' })} ${clock(ts)}`;
}

function asOf(ts, now) {
  const sameDay = new Date(ts).toDateString() === new Date(now).toDateString();
  return sameDay ? clock(ts) : `${new Date(ts).toLocaleDateString([], { weekday: 'short' })} ${clock(ts)}`;
}

export class MissionControl extends Board {
  constructor() {
    super(1536, 864);
    this.provider = 'claude'; // whose limits and tokens the footer shows
  }

  setProvider(id) {
    if (!PROVIDERS.some((p) => p.id === id) || id === this.provider) return;
    this.provider = id;
    this.lastKey = '';
    if (this.lastArgs) this.draw(...this.lastArgs);
  }

  draw(agents, now, { offline = false, today = null } = {}) {
    const live = agents.filter((a) => a.visualStatus !== 'leaving' && a.phase !== 'gone');
    const bySince = (a, b) => a.session.statusSince - b.session.statusSince;
    const waiting = live.filter((a) => a.visualStatus === 'waiting').sort(bySince);
    const napping = live.filter((a) => a.visualStatus === 'sleeping').sort(bySince);
    const working = live.filter((a) => a.visualStatus === 'working' || a.visualStatus === 'stressed');
    const key = [
      Math.floor(now / 1000), offline, today?.now, this.provider,
      waiting.map((a) => `${a.id}:${a.session.lastMessage?.ts}:${a.session.ask?.text}`).join(','),
      napping.map((a) => a.id).join(','),
      working.map((a) => `${a.id}:${a.session.turnStartedAt}`).join(','),
    ].join('|');
    if (!this.begin(key, [agents, now, { offline, today }])) return;

    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const X = 54, CW = W - 2 * X;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e2a2f');
    g.addColorStop(1, '#122036');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#97ce4c';
    ctx.font = `400 60px "Luckiest Guy", ${ROUND}`;
    ctx.fillText('MISSION CONTROL', X, 92);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6fd3f7';
    ctx.font = `600 32px ${MONO}`;
    ctx.fillText(clock(now, { second: '2-digit' }), W - X, 84);
    if (offline) {
      ctx.fillStyle = '#ff6b5b';
      ctx.font = `800 22px ${ROUND}`;
      ctx.fillText('SCANNER OFFLINE', W - X, 118);
    }
    ctx.textAlign = 'left';

    // Inbox ---------------------------------------------------------------
    ctx.fillStyle = STATUS_COLORS.waiting;
    ctx.font = `800 26px ${ROUND}`;
    ctx.fillText(waiting.length ? `NEEDS YOU · ${waiting.length}` : 'NEEDS YOU', X, 160);

    let y = 180;
    if (waiting.length) {
      for (const a of waiting.slice(0, MAX_CARDS)) {
        this.card(a, X, y, CW, 138, now);
        y += 150;
      }
      if (waiting.length > MAX_CARDS) {
        ctx.fillStyle = MUTED;
        ctx.font = `700 24px ${ROUND}`;
        ctx.fillText(`+${waiting.length - MAX_CARDS} more waiting: look for the waving agents 👋`, X + 8, y + 18);
        y += 40;
      }
    } else {
      ctx.fillStyle = 'rgba(126, 224, 126, 0.08)';
      roundRect(ctx, X, y, CW, 190, 18);
      ctx.fill();
      ctx.fillStyle = STATUS_COLORS.working;
      ctx.font = `800 50px ${ROUND}`;
      ctx.fillText('✓ Nobody needs you right now', X + 40, y + 88);
      ctx.fillStyle = '#c9d3df';
      ctx.font = `600 28px ${ROUND}`;
      const longest = [...working].sort((a, b) => a.session.turnStartedAt - b.session.turnStartedAt)[0];
      const sub = longest
        ? `${working.length} working · longest turn so far: ${longest.session.project} (${formatDuration(now - longest.session.turnStartedAt)})`
        : live.length ? 'Everyone is napping.' : offline ? 'Can’t reach the session scanner.' : 'No agents running. Start one in your terminal.';
      ctx.fillText(fit(ctx, sub, CW - 80), X + 40, y + 140);
      y += 214;
    }

    // Idle for a while: still open, and still waiting on you in principle.
    if (napping.length) {
      y += 8;
      ctx.fillStyle = STATUS_COLORS.sleeping;
      ctx.font = `800 22px ${ROUND}`;
      ctx.fillText('NAPPING (IDLE 15M+)', X, y + 30);
      let x = X + 270;
      for (const a of napping) {
        ctx.font = `700 22px ${ROUND}`;
        const text = `${a.session.project} · ${formatDuration(now - a.session.statusSince).split(' ')[0]}`;
        const w = ctx.measureText(text).width + 44;
        if (x + w > X + CW) break;
        const action = { id: `agent:${a.id}`, kind: 'agent', agentId: a.id, label: `${a.session.project} · napping` };
        const hot = this.isHovered(action);
        ctx.fillStyle = hot ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
        roundRect(ctx, x, y + 4, w, 40, 20);
        ctx.fill();
        ctx.fillStyle = a.colorHex;
        ctx.beginPath();
        ctx.arc(x + 20, y + 24, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hot ? '#fff' : '#c9d3df';
        ctx.fillText(text, x + 34, y + 32);
        this.region(x, y + 4, w, 40, action);
        x += w + 12;
      }
    }

    this.footer(X, H - 130, CW, now, today);
    this.texture.needsUpdate = true;
  }

  card(a, x, y, w, h, now) {
    const { ctx } = this;
    const s = a.session;
    const action = { id: `agent:${a.id}`, kind: 'agent', agentId: a.id, label: `${s.project} · waiting on you` };
    const hot = this.isHovered(action);
    ctx.fillStyle = hot ? 'rgba(255, 210, 74, 0.16)' : 'rgba(255, 255, 255, 0.06)';
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    if (hot) {
      ctx.strokeStyle = STATUS_COLORS.waiting;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.fillStyle = a.colorHex;
    roundRect(ctx, x, y, 12, h, [18, 0, 0, 18]);
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.fillStyle = STATUS_COLORS.waiting;
    ctx.font = `800 38px ${ROUND}`;
    const wait = formatDuration(now - s.statusSince);
    ctx.fillText(wait, x + w - 28, y + 50);
    const waitW = ctx.measureText(wait).width;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#fff';
    ctx.font = `800 34px ${ROUND}`;
    const project = fit(ctx, s.project || s.title, 420);
    ctx.fillText(project, x + 36, y + 50);
    const pw = ctx.measureText(project).width;
    ctx.fillStyle = MUTED;
    ctx.font = `600 26px ${ROUND}`;
    ctx.fillText(fit(ctx, s.title, w - pw - waitW - 120), x + 36 + pw + 18, y + 50);

    const { icon, text } = inboxLine(s);
    ctx.fillStyle = '#dfe7f1';
    ctx.font = `500 27px ${ROUND}`;
    wrap(ctx, `${icon} ${text}`, w - 72, 2).forEach((line, i) => ctx.fillText(line, x + 36, y + 90 + i * 34));
    this.region(x, y, w, h, action);
  }

  footer(x, y, w, now, today) {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();

    // Which provider: two pills, the selected one filled in its colour.
    let px = x;
    ctx.font = `800 24px ${ROUND}`;
    for (const p of PROVIDERS) {
      const pw = ctx.measureText(p.label).width + 40;
      const action = { id: `limits:${p.id}`, kind: 'limits', provider: p.id, label: `Show ${p.name} limits and tokens` };
      const on = this.provider === p.id;
      ctx.fillStyle = on ? p.color : this.isHovered(action) ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
      roundRect(ctx, px, y + 16, pw, 42, 21);
      ctx.fill();
      ctx.fillStyle = on ? '#15181d' : '#dfe7f1';
      ctx.fillText(p.label, px + 20, y + 45);
      this.region(px, y + 16, pw, 42, action);
      px += pw + 10;
    }
    const provider = PROVIDERS.find((p) => p.id === this.provider);
    const limits = today?.limits?.[provider.id];
    // An old snapshot is shown greyed out, with how to refresh it.
    const stale = !!limits?.staleAt && now > limits.staleAt;

    ctx.fillStyle = stale ? STATUS_COLORS.waiting : MUTED;
    ctx.font = `800 20px ${ROUND}`;
    const caption = `USAGE LIMITS${limits?.at ? ` · as of ${asOf(limits.at, now)}` : ''}${stale ? ' · stale, run /usage in Claude Code' : ''}`;
    ctx.fillText(fit(ctx, caption, x + w - 400 - (px + 18)), px + 18, y + 44);

    let mx = x;
    const my = y + 104;
    if (limits?.windows?.length) {
      for (const win of limits.windows.slice(0, 2)) {
        const reset = win.resetsAt && win.resetsAt <= now;
        // A snapshot can't tell you what happened after its window reset.
        const used = reset ? (limits.live ? 0 : null) : win.usedPercent;
        const color = used === null || stale ? MUTED : used < 50 ? STATUS_COLORS.working : used < 80 ? STATUS_COLORS.waiting : STATUS_COLORS.stressed;
        ctx.fillStyle = '#dfe7f1';
        ctx.font = `800 26px ${ROUND}`;
        ctx.fillText(win.name, mx, my);
        const bx = mx + 84, bw = 120;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        roundRect(ctx, bx, my - 18, bw, 20, 10);
        ctx.fill();
        if (used !== null) {
          ctx.fillStyle = color;
          roundRect(ctx, bx, my - 18, Math.max(8, (bw * Math.min(100, used)) / 100), 20, 10);
          ctx.fill();
        }
        ctx.fillStyle = color;
        ctx.fillText(used === null ? '–' : `${Math.round(used)}%`, bx + bw + 12, my);
        ctx.fillStyle = MUTED;
        ctx.font = `600 20px ${ROUND}`;
        const note = reset ? (limits.live ? 'window reset' : 'reset since then') : formatReset(win.resetsAt, now);
        ctx.fillText(note, bx + bw + 78, my - 1);
        mx += 460;
      }
    } else {
      ctx.fillStyle = MUTED;
      ctx.font = `600 24px ${ROUND}`;
      const none = provider.id === 'claude' ? 'Claude Code hasn’t saved your usage limits yet.' : 'No Codex usage seen this week.';
      ctx.fillText(today ? none : 'Loading…', x, my);
    }

    const tx = x + w - 380;
    ctx.fillStyle = MUTED;
    ctx.font = `800 20px ${ROUND}`;
    ctx.fillText('TOKENS TODAY', tx, y + 44);
    ctx.font = `600 18px ${ROUND}`;
    ctx.fillText('incl. cached context', tx + 160, y + 44);
    if (today) {
      ctx.fillStyle = provider.color;
      ctx.font = `800 40px ${ROUND}`;
      ctx.fillText(formatTokens(today.tokens[provider.id]), tx, my + 4);
    }
  }
}
