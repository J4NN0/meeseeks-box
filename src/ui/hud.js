import { MASCOT_MODES, agentColor } from '../characters/index.js';
import { LEGEND_PROVIDERS, STATUS_COLORS, STATUS_LABELS, formatDuration, providerInfo, testSummary } from '../status.js';
import { Talk } from './talk.js';
import { copyFrom, esc, shellQuote } from './util.js';

const $ = (id) => document.getElementById(id);
const tokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n || 0));

const KIND_NAMES = { meeseeks: 'A Meeseeks', clawd: 'Clawd', butterbot: 'A Butter Bot' };
/** The agent panel's tabs, the chat first. */
const TABS = [['chat', '💬 Chat'], ['activity', '📜 Activity'], ['details', '🔎 Details']];
const LEGEND_STATUSES = [
  ['working', 'Working'],
  ['waiting', 'Waiting on you'],
  ['stressed', 'Long turn (existence is pain)'],
  ['sleeping', 'Napping (idle)'],
];

export class Hud {
  constructor({ mode, onModeChange, onWalk, onMeeting, onReset, onClosePanel, onGoToAgent, onVerse }) {
    const select = $('mascot-mode');
    for (const [value, label] of Object.entries(MASCOT_MODES)) select.add(new Option(label, value, false, value === mode));
    select.addEventListener('change', () => onModeChange(select.value));

    this.walkBtn = $('walk-toggle');
    this.walkBtn.addEventListener('click', () => onWalk());
    // Walking needs a mouse to capture; hide it on touch-only devices.
    if (!window.matchMedia('(pointer: fine)').matches) this.walkBtn.hidden = true;
    this.meetingBtn = $('meeting-toggle');
    this.meetingBtn.addEventListener('click', () => onMeeting());
    $('reset-view').addEventListener('click', () => onReset());
    $('panel-close').addEventListener('click', () => onClosePanel());
    $('legend').innerHTML = [
      ...LEGEND_PROVIDERS.map((p) => `<div><i style="--c: ${providerInfo(p).color}"></i>${esc(providerInfo(p).name)}</div>`),
      '<hr />',
      ...LEGEND_STATUSES.map(([s, label]) => `<div><i class="st" style="--c: ${STATUS_COLORS[s]}"></i>${esc(label)}</div>`),
    ].join('');

    this.verses = $('verses');
    this.versesKey = '';
    this.verses.addEventListener('click', (e) => {
      const go = e.target.closest('[data-level]');
      if (go) onVerse?.(Number(go.dataset.level));
    });

    this.panel = $('panel');
    this.panelBody = $('panel-body');
    this.selected = null; // agent in the panel
    this.project = null; // or { key, focus } for a project recap
    this.today = null;
    this.agents = [];
    this.panelKey = '';
    this.talk = new Talk();
    this.tab = 'chat';
    this.onGoToAgent = onGoToAgent;
    // One listener for the project panel's buttons, which are rebuilt often.
    this.panelBody.addEventListener('click', (e) => {
      const go = e.target.closest('[data-agent]');
      if (go) this.onGoToAgent?.(go.dataset.agent);
    });
  }

  get panelOpen() { return !this.panel.hidden; }

  /** First-person overlays: crosshair while walking, pause card when not. */
  setWalk({ active, locked, flying, resuming }) {
    document.body.classList.toggle('walking', active);
    document.body.classList.toggle('locked', active && locked);
    this.walkBtn.setAttribute('aria-pressed', String(active));
    $('crosshair').hidden = !(active && locked);
    $('walk-hint').hidden = !(active && locked);
    $('walk-pause').hidden = !(active && !locked && !flying && !this.panelOpen);
    $('walk-pause').classList.toggle('resuming', !!resuming);
  }

  /** The meeting button: pressed while one's on, and pressing it again ends it. */
  setMeeting(on) {
    this.meetingBtn.setAttribute('aria-pressed', String(on));
    this.meetingBtn.title = on ? 'End the meeting: everyone back to their desks' : 'Call every agent to the meeting room';
  }

  /** What the crosshair is on: an agent, a board item (its label), or nothing. */
  setAim(target) {
    const agent = target?.agent;
    const text = agent ? `${agent.session.project || agent.session.title} · ${STATUS_LABELS[agent.visualStatus] || ''}` : target?.action?.label || '';
    $('crosshair').classList.toggle('on', !!text);
    const aim = $('aim');
    if (aim.dataset.text === text) return;
    aim.dataset.text = text;
    // First line is the headline; anything after a newline is detail.
    const [title, ...rest] = text.split('\n');
    const parts = [];
    if (title) parts.push(Object.assign(document.createElement('b'), { textContent: title }));
    if (rest.length) parts.push(Object.assign(document.createElement('span'), { className: 'detail', textContent: rest.join(' ') }));
    aim.replaceChildren(...parts);
  }

  update(agents, feedState, now, today) {
    this.agents = agents;
    this.today = today;
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
    document.title = waiting ? `(${waiting}) Meeseeks Box` : 'Meeseeks Box';
    $('empty').hidden = total > 0 || feedState === 'connecting' || document.body.classList.contains('walking');

    if (this.selected) this.renderPanel(now);
    else if (this.project) this.renderProject(now);
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

  /**
   * Breadcrumb of the open universes (garage › Microverse › …), each one a
   * button to jump there. Hidden while the garage is all there is.
   */
  setVerses(list, active) {
    const key = JSON.stringify([list, active]);
    if (key === this.versesKey) return;
    this.versesKey = key;
    this.verses.hidden = list.length < 2;
    this.verses.innerHTML = list.map((v, i) => `${i ? '<span class="sep">›</span>' : ''}<button type="button" data-level="${v.level}"${v.level === active ? ' aria-current="true"' : ''}${v.open ? '' : ' disabled'} title="${v.level === active ? `You're in the ${esc(v.name)}` : `Go to the ${esc(v.name)}`}">
      <span>${v.level ? '🔋' : '🏠'} ${esc(v.name)}</span><span class="n">${v.count}</span>${v.waiting ? '<i class="waiting" title="Someone here needs you"></i>' : ''}
    </button>`).join('');
  }

  announce(type, agent) {
    const who = `<b>${esc(agent.session.project || agent.session.title)}</b>${agent.where ? ` in the ${esc(agent.where)}` : ''}`;
    if (type === 'spawn') this.toast(`🟦 ${KIND_NAMES[agent.kind] || 'An agent'} appeared for ${who}`, agent.colorHex);
    if (type === 'leave') this.toast(`✨ ${who} is done. *poof*`, agent.colorHex);
    if (type === 'waiting') this.toast(`🙋 ${who} is waiting on you`, agent.colorHex);
  }

  showPanel(agent) {
    this.selected = agent;
    this.project = null;
    this.panelKey = '';
    this.panel.hidden = false;
    this.agentKeys = {};
    // Built once per agent; each part is refreshed on its own, so a reply
    // arriving doesn't wipe what you're typing.
    this.panelBody.innerHTML = `
      <header class="agent-head"></header>
      <nav class="tabs" role="tablist">
        ${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}">${label}</button>`).join('')}
      </nav>
      <section class="tab chat" data-tab="chat"></section>
      <section class="tab activity" data-tab="activity"><ol></ol></section>
      <section class="tab details" data-tab="details"></section>`;
    for (const btn of this.panelBody.querySelectorAll('[role=tab]')) btn.addEventListener('click', () => this.setTab(btn.dataset.tab));
    this.talk.mount(this.panelBody.querySelector('.tab.chat'), agent);
    this.setTab(this.tab);
    this.renderPanel(Date.now());
  }

  setTab(id) {
    this.tab = id;
    for (const el of this.panelBody.querySelectorAll('[data-tab]')) {
      const on = el.dataset.tab === id;
      if (el.getAttribute('role') === 'tab') el.setAttribute('aria-selected', String(on));
      else el.hidden = !on;
    }
    this.talk.visible = id === 'chat';
    if (id === 'chat') this.talk.update(Date.now());
  }

  /** Today's recap for one project; `focus` highlights a session or one of its turns. */
  showProject(key, focus = null) {
    this.selected = null;
    this.project = { key, focus, scrolled: false };
    this.panelKey = '';
    this.panel.hidden = false;
    this.renderProject(Date.now());
  }

  hidePanel() {
    this.selected = null;
    this.project = null;
    this.panel.hidden = true;
  }

  renderPanel(now) {
    const a = this.selected;
    if (!a) return;
    const s = a.session;
    // Each part is rebuilt only when its content changes: replacing the DOM
    // every tick would swallow clicks and clear text selection. Times are
    // refreshed in place.
    const changed = (part, key) => {
      if (this.agentKeys[part] === key) return false;
      this.agentKeys[part] = key;
      return true;
    };
    const p = providerInfo(s.provider);
    const rawId = s.id.split(':').slice(1).join(':');
    this.panel.style.setProperty('--agent', a.colorHex);
    this.panel.style.setProperty('--status', STATUS_COLORS[a.visualStatus] || '#999');

    if (changed('head', `${s.id}:${a.visualStatus}:${s.title}:${a.kind}`)) {
      this.panelBody.querySelector('.agent-head').innerHTML = `
        <span class="provider"><i></i>${esc(p.name)} · ${esc(KIND_NAMES[a.kind] || '')}</span>
        <h2>${esc(s.title)}</h2>
        <span class="status">${esc(STATUS_LABELS[a.visualStatus] || a.visualStatus)}</span>`;
    }

    this.talk.update(now);

    if (changed('activity', `${s.id}:${s.activity.length}:${s.activity.at(-1)?.ts}`)) {
      const items = [...s.activity].reverse().map((e) => `
        <li data-kind="${esc(e.kind)}"><span>${esc(e.icon || '•')}</span><span>${esc(e.text)}${e.cmd && e.cmd !== e.text ? `<br><code>${esc(e.cmd)}</code>` : ''}</span><time${e.ts ? ` data-ts="${e.ts}"` : ''}>${e.ts ? ago(now - e.ts) : ''}</time></li>`).join('');
      this.panelBody.querySelector('.tab.activity ol').innerHTML = items || '<li><span>🫥</span><span>Nothing yet.</span><time></time></li>';
    }

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
      ['Box channel', s.provider !== 'claude' ? '' : s.talk?.enabled ? 'connected' : s.talk ? 'switched off' : 'not connected'],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');
    if (changed('details', JSON.stringify([s.id, rows.map(([k, v, since]) => (since ? [k, since] : [k, v]))]))) {
      this.panelBody.querySelector('.tab.details').innerHTML = `
        <dl>${rows.map(([k, v, since]) => `<dt>${esc(k)}</dt><dd${since ? ` data-since="${since}"` : ''}>${esc(v)}</dd>`).join('')}</dl>
        ${resume ? `<div class="actions"><button type="button" data-copy="${esc(resume)}">Copy resume command</button><button type="button" data-copy="${esc(rawId)}">Copy session id</button></div>` : ''}`;
      for (const btn of this.panelBody.querySelectorAll('.tab.details [data-copy]')) btn.addEventListener('click', () => copyFrom(btn));
    }
    this.updateTimes(now);
  }


  renderProject(now) {
    const { key, focus } = this.project;
    const today = this.today;
    const p = today?.projects.find((x) => x.key === key);
    const live = new Map(this.agents.map((a) => [a.id, a]));
    const panelKey = `${key}:${today?.now}:${JSON.stringify(focus)}:${[...live.keys()].join()}`;
    if (panelKey === this.panelKey) return;
    this.panelKey = panelKey;
    this.panel.style.setProperty('--agent', '#97ce4c');
    this.panel.style.setProperty('--status', '#fff3a8');
    if (!p) {
      this.panelBody.innerHTML = `<header><span class="provider"><i></i>Today</span><h2>Nothing recorded yet</h2></header>`;
      return;
    }
    const sessions = today.sessions.filter((s) => p.sessionIds.includes(s.id));
    const workMs = sessions.reduce((n, s) => n + s.turns.reduce((m, t) => m + (t.end - Math.max(t.start, today.since)), 0), 0);
    const add = p.commits.reduce((n, c) => n + c.added, 0);
    const del = p.commits.reduce((n, c) => n + c.removed, 0);
    const test = testSummary(p.test, now);
    const rows = [
      ['Directory', p.key],
      ['Branch', p.branch],
      ['Uncommitted', p.changes ? (p.changes.files ? `${p.changes.files} files · +${num(p.changes.added)} −${num(p.changes.removed)}` : 'nothing') : p.repo ? '' : 'not a git repo'],
      ['Commits today', p.repo ? (p.commits.length ? `${p.commits.length} · +${num(add)} −${num(del)}` : 'none') : ''],
      ['Last test run', test ? test.text : 'none today'],
      ['Agent time', formatDuration(workMs)],
    ].filter(([, v]) => v);
    const color = (id) => live.get(id)?.colorHex || `#${agentColor(id.split(':')[0], id).getHexString()}`;
    const dots = (ids) => ids.map((id) => `<i class="dot" style="--c:${color(id)}"></i>`).join('');

    const files = p.repo
      ? (p.changes?.list || []).map((f) => `<li><code>${esc(f.code)}</code><span>${esc(f.path)}</span><span class="by">${dots(f.by)}</span><span class="num">${f.added || f.removed ? `+${num(f.added)} −${num(f.removed)}` : ''}</span></li>`)
      : p.edited.map((f) => `<li><code>✏️</code><span>${esc(f.path)}</span><span class="by">${dots(f.by)}</span><span class="num">${clock(f.ts)}</span></li>`);
    const more = p.changes && p.changes.files > (p.changes.list || []).length ? `<li class="more">and ${p.changes.files - p.changes.list.length} more</li>` : '';
    const commits = p.commits.map((c) => `<li><code>${esc(c.hash)}</code><span>${esc(c.subject)}</span><span class="by"></span><span class="num">${clock(c.ts)}</span></li>`);

    const sessionHtml = sessions.map((s) => {
      const agent = live.get(s.id);
      const turns = s.turns.map((t, i) => {
        const hl = focus?.sessionId === s.id && focus.turn === i;
        const end = !t.done && i === s.turns.length - 1 && agent && (agent.visualStatus === 'working' || agent.visualStatus === 'stressed') ? null : t.end;
        return `<li data-kind="prompt"${hl ? ' class="hl"' : ''}><span>🧑</span><span>${esc(t.prompt || '(started without a prompt)')}</span><time>${clock(t.start)} · ${end ? formatDuration(end - t.start) : 'now'}</time></li>`;
      }).reverse().join('');
      const status = agent ? STATUS_LABELS[agent.visualStatus] || '' : 'ended';
      const recap = s.recap ? `<blockquote>“${esc(s.recap.text)}” <time>${clock(s.recap.ts)}</time></blockquote>` : '';
      const testLine = s.test ? `<p class="test">🧪 <code>${esc(s.test.cmd)}</code> ${esc(testSummary(s.test, now).text)}</p>` : '';
      return `
        <section class="session${focus?.sessionId === s.id ? ' focus' : ''}" data-session="${esc(s.id)}">
          <h4><i class="dot" style="--c:${color(s.id)}"></i><span>${esc(s.title)}</span><em>${esc(providerInfo(s.provider).name)} · ${esc(status)}</em>
          ${agent ? `<button type="button" data-agent="${esc(s.id)}">Go to agent</button>` : ''}</h4>
          ${recap}${testLine}
          <ol>${turns}</ol>
        </section>`;
    }).join('');

    const scroll = this.panelBody.querySelector('.scroll')?.scrollTop || 0;
    this.panelBody.innerHTML = `
      <header>
        <span class="provider"><i></i>Today’s recap</span>
        <h2>${esc(p.name)}</h2>
        <span class="status">${sessions.length} session${sessions.length === 1 ? '' : 's'} today</span>
      </header>
      <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="scroll">
        ${p.repo ? '<h3>Uncommitted changes</h3>' : '<h3>Files the agents edited</h3>'}
        <ul class="files">${files.join('') || '<li class="more">Nothing here.</li>'}${more}</ul>
        ${p.repo ? `<h3>Commits today</h3><ul class="files">${commits.join('') || '<li class="more">None yet.</li>'}</ul>` : ''}
        <h3>Sessions and turns</h3>
        ${sessionHtml}
      </div>`;
    const box = this.panelBody.querySelector('.scroll');
    box.scrollTop = scroll;
    if (!this.project.scrolled && focus) {
      this.project.scrolled = true;
      const target = box.querySelector('li.hl') || box.querySelector('section.focus');
      target?.scrollIntoView({ block: 'center' });
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

const num = (n) => Number(n || 0).toLocaleString();
const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function ago(ms) {
  if (ms < 5000) return 'now';
  return `${formatDuration(ms).split(' ')[0]} ago`;
}
