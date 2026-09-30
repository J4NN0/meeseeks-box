import { MASCOT_MODES } from '../characters/index.js';
import { LEGEND_PROVIDERS, STATUS_COLORS, STATUS_LABELS, formatDuration, providerInfo } from '../status.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n || 0));

const KIND_NAMES = { meeseeks: 'A Meeseeks', clawd: 'Clawd', butterbot: 'A Butter Bot' };
const LEGEND_STATUSES = [
  ['working', 'Working'],
  ['waiting', 'Waiting on you'],
  ['stressed', 'Long turn (existence is pain)'],
  ['sleeping', 'Napping (idle)'],
];

export class Hud {
  constructor({ mode, onModeChange, onWalk, onReset, onClosePanel }) {
    const select = $('mascot-mode');
    for (const [value, label] of Object.entries(MASCOT_MODES)) select.add(new Option(label, value, false, value === mode));
    select.addEventListener('change', () => onModeChange(select.value));

    this.walkBtn = $('walk-toggle');
    this.walkBtn.addEventListener('click', () => onWalk());
    // Walking needs a mouse to capture; hide it on touch-only devices.
    if (!window.matchMedia('(pointer: fine)').matches) this.walkBtn.hidden = true;
    $('reset-view').addEventListener('click', () => onReset());
    $('panel-close').addEventListener('click', () => onClosePanel());
    $('legend').innerHTML = [
      ...LEGEND_PROVIDERS.map((p) => `<div><i style="--c: ${providerInfo(p).color}"></i>${esc(providerInfo(p).name)}</div>`),
      '<hr />',
      ...LEGEND_STATUSES.map(([s, label]) => `<div><i class="st" style="--c: ${STATUS_COLORS[s]}"></i>${esc(label)}</div>`),
    ].join('');

    this.panel = $('panel');
    this.panelBody = $('panel-body');
    this.selected = null;
    this.panelKey = '';
  }

  /** First-person overlays: crosshair while walking, pause card when not. */
  setWalk({ active, locked, flying, resuming }) {
    document.body.classList.toggle('walking', active);
    document.body.classList.toggle('locked', active && locked);
    this.walkBtn.setAttribute('aria-pressed', String(active));
    $('crosshair').hidden = !(active && locked);
    $('walk-hint').hidden = !(active && locked);
    $('walk-pause').hidden = !(active && !locked && !flying && !this.selected);
    $('walk-pause').classList.toggle('resuming', !!resuming);
  }

  setAim(agent) {
    $('crosshair').classList.toggle('on', !!agent);
    const text = agent ? `${agent.session.project || agent.session.title} · ${STATUS_LABELS[agent.visualStatus] || ''}` : '';
    const aim = $('aim');
    if (aim.textContent !== text) aim.textContent = text;
  }

  update(agents, feedState, now) {
    const n = (s) => agents.filter((a) => a.visualStatus === s).length;
    const working = n('working') + n('stressed');
    const waiting = n('waiting');
    const sleeping = n('sleeping');
    $('counts').innerHTML = [
      [working, STATUS_COLORS.working, 'working'],
      [waiting, STATUS_COLORS.waiting, 'need you'],
      [sleeping, STATUS_COLORS.sleeping, 'napping'],
    ].map(([c, color, label]) => `<span class="count" style="--c:${color}"><i></i>${c} ${label}</span>`).join('');

    const empty = $('empty');
    empty.dataset.state = feedState;

    const total = agents.filter((a) => a.visualStatus !== 'leaving').length;
    $('tagline').textContent = total
      ? `Look at me! ${working} working${waiting ? `, ${waiting} waiting on you` : ''}${sleeping ? `, ${sleeping} napping` : ''}.`
      : 'Existence is pain… and the office is empty.';
    document.title = waiting ? `(${waiting}) Meeseeks Box` : 'Meeseeks Box';
    $('empty').hidden = total > 0 || feedState === 'connecting' || document.body.classList.contains('walking');

    if (this.selected) this.renderPanel(now);
  }

  toast(html, color) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (color) el.style.setProperty('--agent', color);
    el.innerHTML = html;
    $('toasts').append(el);
    setTimeout(() => el.remove(), 4200);
    const all = $('toasts').children;
    if (all.length > 4) all[0].remove();
  }

  announce(type, agent) {
    const who = `<b>${esc(agent.session.project || agent.session.title)}</b>`;
    if (type === 'spawn') this.toast(`🟦 ${KIND_NAMES[agent.kind] || 'An agent'} appeared for ${who}`, agent.colorHex);
    if (type === 'leave') this.toast(`✨ ${who} is done. *poof*`, agent.colorHex);
    if (type === 'waiting') this.toast(`🙋 ${who} is waiting on you`, agent.colorHex);
  }

  showPanel(agent) {
    this.selected = agent;
    this.panelKey = '';
    this.panel.hidden = false;
    this.renderPanel(Date.now());
  }

  hidePanel() {
    this.selected = null;
    this.panel.hidden = true;
  }

  renderPanel(now) {
    const a = this.selected;
    if (!a) return;
    const s = a.session;
    // Rebuild only when content changes: replacing the DOM every tick would
    // swallow clicks and clear text selection. Times are refreshed in place.
    const key = `${s.id}:${a.visualStatus}:${s.activity.length}:${s.activity.at(-1)?.ts}:${a.phase}:${s.startedAt}:${s.turnStartedAt}:${s.contextTokens}:${s.helpers}:${s.title}:${s.branch}:${s.model}`;
    if (key === this.panelKey) {
      this.updateTimes(now);
      return;
    }
    this.panelKey = key;
    const p = providerInfo(s.provider);
    const rawId = s.id.split(':').slice(1).join(':');
    const resume = s.provider === 'claude' ? `cd ${shellQuote(s.cwd)} && claude --resume ${rawId}` : s.provider === 'codex' ? `codex resume ${rawId}` : '';
    const rows = [
      ['Project', s.project],
      ['Directory', s.cwd],
      ['Branch', s.branch],
      ['Model', s.model],
      ['Session', rawId],
      ['PID', s.pid],
      ['Alive', s.startedAt ? formatDuration(now - s.startedAt) : '', s.startedAt],
      ['This turn', s.turnStartedAt ? formatDuration(now - s.turnStartedAt) : '', s.turnStartedAt],
      ['Context', s.contextTokens ? `${tokens(s.contextTokens)} tokens` : ''],
      ['Helpers', s.helpers ? `${s.helpers} subagent${s.helpers > 1 ? 's' : ''}` : ''],
      ['Client', [s.entrypoint, s.version].filter(Boolean).join(' · ')],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');

    const items = [...s.activity].reverse().map((e) => `
      <li data-kind="${esc(e.kind)}"><span>${esc(e.icon || '•')}</span><span>${esc(e.text)}${e.cmd && e.cmd !== e.text ? `<br><code>${esc(e.cmd)}</code>` : ''}</span><time${e.ts ? ` data-ts="${e.ts}"` : ''}>${e.ts ? ago(now - e.ts) : ''}</time></li>`).join('');

    const scroll = this.panelBody.querySelector('ol')?.scrollTop || 0;
    this.panel.style.setProperty('--agent', a.colorHex);
    this.panel.style.setProperty('--status', STATUS_COLORS[a.visualStatus] || '#999');
    this.panelBody.innerHTML = `
      <header>
        <span class="provider"><i></i>${esc(p.name)} · ${esc(KIND_NAMES[a.kind] || '')}</span>
        <h2>${esc(s.title)}</h2>
        <span class="status">${esc(STATUS_LABELS[a.visualStatus] || a.visualStatus)}</span>
      </header>
      <dl>${rows.map(([k, v, since]) => `<dt>${esc(k)}</dt><dd${since ? ` data-since="${since}"` : ''}>${esc(v)}</dd>`).join('')}</dl>
      ${resume ? `<div class="actions"><button type="button" data-copy="${esc(resume)}">Copy resume command</button><button type="button" data-copy="${esc(rawId)}">Copy session id</button></div>` : ''}
      <h3>Recent activity</h3>
      <ol>${items || '<li><span>🫥</span><span>Nothing yet.</span><time></time></li>'}</ol>`;
    this.panelBody.querySelector('ol').scrollTop = scroll;
    for (const btn of this.panelBody.querySelectorAll('[data-copy]')) {
      btn.dataset.label = btn.textContent;
      if (this.copied?.value === btn.dataset.copy && now < this.copied.until) btn.textContent = this.copied.label;
      btn.addEventListener('click', async () => {
        let label = 'Copied!';
        try {
          await navigator.clipboard.writeText(btn.dataset.copy);
        } catch {
          label = 'Copy failed';
        }
        this.copied = { value: btn.dataset.copy, label, until: Date.now() + 1500 };
        btn.textContent = label;
        setTimeout(() => { if (btn.isConnected) btn.textContent = btn.dataset.label; }, 1500);
      });
    }
  }

  updateTimes(now) {
    for (const el of this.panelBody.querySelectorAll('[data-since]')) {
      const text = formatDuration(now - Number(el.dataset.since));
      if (el.textContent !== text) el.textContent = text;
    }
    for (const el of this.panelBody.querySelectorAll('time[data-ts]')) {
      const text = ago(now - Number(el.dataset.ts));
      if (el.textContent !== text) el.textContent = text;
    }
  }
}

function ago(ms) {
  if (ms < 5000) return 'now';
  return `${formatDuration(ms).split(' ')[0]} ago`;
}

function shellQuote(s) {
  return /^[\w./-]+$/.test(s || '') ? s : `'${String(s).replace(/'/g, "'\\''")}'`;
}
