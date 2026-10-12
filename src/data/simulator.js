// A pretend session feed, to try the office with more agents than you have
// running: open the dev server with `?debug=true&sim` (or `&sim=20` to start
// with 20, `&sim=0` with none).
// It stands in for Feed (data/feed.js) and adds a small panel to add and
// remove agents, set what they're doing, and send the nappers for a coffee.
// The box adds one too, instead of starting a real session.
// Dev only: main.js never builds it in production.

import { debugParams } from '../debug.js';

const TICK_MS = 2000;
const MAX = 48;
/** With "live" on, per tick: the odds an agent changes status, and one comes or goes. */
const CHURN = { status: 0.06, arrive: 0.04, leave: 0.03 };

const PROJECTS = ['portal-gun', 'plumbus-api', 'szechuan-sauce', 'council-of-ricks', 'interdimensional-cable', 'butter-robot', 'microverse-battery', 'squanch-ui', 'gazorpazorp', 'blips-and-chitz', 'citadel-ops', 'mr-poopybutthole'];
const TASKS = ['Fix the flaky login test', 'Refactor the portal router', 'Add dark mode', 'Bump three.js', 'Write the release notes', 'Speed up the build', 'Port the CLI to Node 22', 'Clean up the README', 'Profile the render loop', 'Add a retry to the uploader', 'Migrate the database', 'Split the giant module'];
const TOOLS = ['Edit src/app.js', 'Read package.json', 'Bash npm test', 'Grep "TODO"', 'Edit README.md', 'Bash git diff', 'Write src/util.js', 'Read vite.config.js'];
const SAYS = ['All tests pass now.', 'I refactored the router.', 'Done: the build is 30% faster.', 'Should I also update the docs?'];
const ASKS = [
  { kind: 'question', text: 'Which database should I migrate to?' },
  { kind: 'tool', text: 'rm -rf node_modules && npm install' },
  { kind: 'plan', text: 'Split app.js into three modules, then add tests.' },
];
const STATUSES = ['working', 'stressed', 'waiting', 'sleeping'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function simCount() {
  if (!debugParams.has('sim')) return null;
  const n = Number(debugParams.get('sim'));
  return debugParams.get('sim') !== '' && Number.isFinite(n) && n >= 0 ? Math.min(MAX, Math.round(n)) : 16;
}

export class SimFeed {
  constructor(count, { coffee } = {}) {
    /** Ours to change; listeners get copies, as a real poll hands over fresh ones. */
    this.list = [];
    this.sessions = [];
    this.state = 'live';
    this.listeners = new Set();
    this.next = 0;
    this.live = false;
    this.coffee = coffee;
    for (let i = 0; i < count; i++) this.add(pick(['working', 'working', 'waiting', 'sleeping']));
    this.panel = debugParams.get('hideSim') === 'true' ? null : this.buildPanel();
  }

  onChange(fn) { this.listeners.add(fn); }

  start() {
    this.emit();
    this.timer = setInterval(() => {
      if (this.live) this.churn();
      this.emit();
    }, TICK_MS);
  }

  poll() {
    this.emit();
  }

  emit() {
    this.sessions = this.list.map((s) => ({ ...s }));
    for (const fn of this.listeners) fn(this.sessions, this.state);
    this.render();
  }

  // ---------------------------------------------------------------- sessions

  add(status = 'working') {
    if (this.list.length >= MAX) return null;
    const i = this.next++;
    const now = Date.now();
    const provider = i % 3 === 2 ? 'codex' : 'claude';
    const s = {
      id: `${provider}:sim-${i}`,
      provider,
      pid: 0,
      name: '',
      title: pick(TASKS),
      cwd: `/sim/${PROJECTS[i % PROJECTS.length]}`,
      project: PROJECTS[i % PROJECTS.length],
      startedAt: now,
      transcriptAt: 0,
      activity: [],
      chat: [],
      // Not a real session: the panel doesn't ask the server about it.
      sim: true,
    };
    this.setStatus(s, status, now);
    this.list.push(s);
    return s.id;
  }

  remove() {
    this.list.pop();
  }

  /** `stressed` is a turn that's been running too long: working since long ago. */
  setStatus(s, status, now = Date.now()) {
    const working = status === 'working' || status === 'stressed';
    Object.assign(s, {
      status: working ? 'working' : status,
      rawStatus: working ? 'busy' : 'idle',
      statusSince: now,
      turnStartedAt: status === 'stressed' ? now - 6 * 3_600_000 : working ? now : 0,
      lastActivityAt: now,
      helpers: working && Math.random() < 0.3 ? 1 : 0,
      ask: status === 'waiting' && Math.random() < 0.6 ? pick(ASKS) : null,
      lastMessage: status === 'waiting' ? { ts: now, text: pick(SAYS) } : null,
    });
    s.activity = [...s.activity, working ? { ts: now, kind: 'tool', icon: '⏺', text: pick(TOOLS) } : { ts: now, kind: 'say', icon: '💬', text: pick(SAYS) }].slice(-20);
  }

  setAll(status) {
    const now = Date.now();
    for (const s of this.list) this.setStatus(s, status === 'mix' ? pick(STATUSES) : status, now);
  }

  churn() {
    const now = Date.now();
    for (const s of this.list) if (Math.random() < CHURN.status) this.setStatus(s, pick(STATUSES), now);
    if (Math.random() < CHURN.arrive) this.add(pick(['working', 'waiting']));
    if (Math.random() < CHURN.leave && this.list.length) this.list.splice(Math.floor(Math.random() * this.list.length), 1);
  }

  // ------------------------------------------------------------------- panel

  buildPanel() {
    const el = document.createElement('aside');
    el.className = 'sim';
    el.innerHTML = `
      <h3>Simulation</h3>
      <div class="row sim-count"><button data-do="minus">−</button><b></b><button data-do="plus">+</button><button data-do="plus5">+5</button></div>
      <div class="row"><button data-all="working">Working</button><button data-all="waiting">Waiting</button><button data-all="sleeping">Napping</button></div>
      <div class="row"><button data-all="stressed">Stressed</button><button data-all="mix">Mix</button><button data-do="coffee">Coffee</button></div>
      <label><input type="checkbox" data-do="live"> Live changes</label>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.all) this.setAll(b.dataset.all);
      else if (b.dataset.do === 'minus') this.remove();
      else if (b.dataset.do === 'plus') this.add();
      else if (b.dataset.do === 'plus5') for (let i = 0; i < 5; i++) this.add();
      else if (b.dataset.do === 'coffee') this.coffee?.();
      this.emit();
    });
    el.querySelector('[data-do="live"]').addEventListener('change', (e) => { this.live = e.target.checked; });
    document.body.append(el);
    return el;
  }

  render() {
    if (!this.panel) return;
    const n = this.list.length;
    this.panel.querySelector('.sim-count b').textContent = `${n} agent${n === 1 ? '' : 's'}`;
  }
}
