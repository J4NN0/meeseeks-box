// Session statuses and providers as the whole app shows them: room, labels
// and HUD all read their colours, names and timers from here.

export const STATUS_COLORS = {
  working: '#7ee07e',
  stressed: '#ff6b5b',
  waiting: '#ffd24a',
  sleeping: '#8b95a5',
  leaving: '#c8a6ff',
};

export const STATUS_LABELS = {
  working: 'Working',
  stressed: 'Existence is pain',
  waiting: 'Waiting on you',
  sleeping: 'Napping',
  leaving: 'Task done!',
};

/** Which speech-bubble situation (see agents/lines.js) a status maps to. */
export const STATUS_SITUATIONS = { working: 'work', stressed: 'stress', waiting: 'wait', sleeping: 'sleep' };

// `color` is the agent colour family (legend), `bar`/`text` the monitor title bar.
const PROVIDERS = {
  claude: { name: 'Claude Code', glyph: '✻', color: '#e0875f', bar: '#d97757', text: '#fff6f0' },
  codex: { name: 'Codex', glyph: '>_', color: '#6ec6ee', bar: '#e9eef5', text: '#15181d' },
  other: { name: 'Agent', glyph: '◉', color: '#8fd18a', bar: '#6ec6ee', text: '#0d2230' },
};

export function providerInfo(p) { return PROVIDERS[p] || PROVIDERS.other; }
export const LEGEND_PROVIDERS = ['claude', 'codex'];

/** When the current status started: the turn while working, else the last change. */
export function statusSince(session, status) {
  return status === 'working' || status === 'stressed' ? session.turnStartedAt || session.statusSince : session.statusSince;
}

export function formatDuration(msec) {
  const s = Math.max(0, Math.floor(msec / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
