// A transcript's diary of the day, kept next to each provider's live summary:
// turns (from your prompt to the agent going quiet), files it edited, test
// runs, token use per local day, and the tool's own "while you were away"
// recap. The whiteboard and the TV read it through /api/today.

import { clip } from './util.js';

const KEEP_MS = 36 * 3_600_000;
const MAX_TESTS = 20;
const MAX_EDITS = 400;

// Commands that run a test suite. Deliberately about runners where a shell
// command starts, not the word "test", so `grep test`, `cat jest.config.js`
// or a script that mentions "npm test" don't count.
const COMMAND_START = String.raw`(?:^|[;&|(\n])\s*(?:(?:env\s+)?\w+=\S*\s+)*(?:(?:time|timeout\s+\S+)\s+)?`;
const RUNNERS = [
  String.raw`(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b`,
  String.raw`(?:npx\s+|bunx\s+|pnpm\s+exec\s+|uv\s+run\s+|poetry\s+run\s+|python3?\s+-m\s+)?(?:vitest|jest|mocha|ava|pytest|unittest|phpunit|rspec)(?=\s|$)`,
  String.raw`(?:npx\s+)?(?:playwright\s+test|cypress\s+run)\b`,
  String.raw`(?:go\s+test|cargo\s+(?:test|nextest)|make\s+(?:test|check)|dotnet\s+test|swift\s+test|mix\s+test|deno\s+test|node\s+--test)\b`,
  String.raw`(?:mvn|gradle|\.\/gradlew)\s[^|;&\n]*\btest\b`,
];
const TEST_RE = new RegExp(`${COMMAND_START}(?:${RUNNERS.join('|')})`);

export function newJournal() {
  return { turns: [], edits: new Map(), tests: [], tokens: new Map(), recap: null };
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const dayKey = (ts) => startOfDay(ts);

/** You sent a prompt (or something else kicked the agent off). */
export function startTurn(j, ts, prompt) {
  if (!ts) return;
  const last = j.turns.at(-1);
  if (last) last.done = true;
  j.turns.push({ start: ts, end: ts, prompt: clip(prompt, 240), done: false });
  while (j.turns.length > 1 && j.turns[0].end < ts - KEEP_MS) j.turns.shift();
}

/** Codex opens the turn before logging the prompt; fill it in when it shows up. */
export function promptTurn(j, ts, prompt) {
  const last = j.turns.at(-1);
  if (last && !last.done && !last.prompt) last.prompt = clip(prompt, 240);
  else startTurn(j, ts, prompt);
}

/**
 * The agent did something. Extends the open turn; with `orStart`, activity
 * after a finished turn opens a new one (the agent picked up on its own).
 */
export function touchTurn(j, ts, orStart = false) {
  if (!ts) return;
  const last = j.turns.at(-1);
  if (last && !last.done) { if (ts > last.end) last.end = ts; return; }
  if (orStart && (!last || ts - last.end > 2000)) startTurn(j, ts, '');
}

export function endTurn(j, ts) {
  const last = j.turns.at(-1);
  if (!last || last.done) return;
  if (ts > last.end) last.end = ts;
  last.done = true;
}

export function noteEdit(j, file, ts) {
  if (!file || !ts) return;
  j.edits.delete(file);
  j.edits.set(file, ts);
  if (j.edits.size > MAX_EDITS) j.edits.delete(j.edits.keys().next().value);
}

// Heredoc bodies and quoted strings are data (a script, a file, an argument
// like node -e "..."), not the command being run.
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?(?:\n\s*\2\b|$)/g;
const QUOTED = /'[^']*'|"(?:[^"\\]|\\.)*"/g;

export const isTestCommand = (cmd) => TEST_RE.test(String(cmd || '').replace(HEREDOC, '').replace(QUOTED, "''"));

/**
 * Reads a test run's outcome from its output. Agents often pipe into `tail`,
 * which hides the exit code, so the runner's own "N failed" wins over it.
 */
export function noteTest(j, ts, cmd, output, { exitCode, isError } = {}) {
  const text = String(output || '').slice(-200_000);
  const most = (re) => {
    let n = 0;
    for (const m of text.matchAll(re)) n = Math.max(n, Number(m[1]));
    return n;
  };
  const passed = most(/(\d+)\s+(?:passed|passing)\b/gi);
  const failed = most(/(\d+)\s+(?:failed|failing)\b/gi);
  const code = exitCode ?? Number(text.match(/(?:Exit code:?|exited with code)\s*(\d+)/i)?.[1] ?? NaN);
  let status = 'ran';
  if (failed > 0 || (Number.isFinite(code) && code !== 0) || isError || /^(?:FAIL|--- FAIL)\b/m.test(text)) status = 'fail';
  else if (passed > 0 || code === 0 || isError === false) status = 'pass';
  j.tests.push({ ts, cmd: clip(cmd, 160), status, passed, failed });
  if (j.tests.length > MAX_TESTS) j.tests.shift();
}

export function addTokens(j, ts, n) {
  if (!ts || !(n > 0)) return;
  const key = dayKey(ts);
  j.tokens.set(key, (j.tokens.get(key) || 0) + n);
  if (j.tokens.size > 3) j.tokens.delete(j.tokens.keys().next().value);
}

export function noteRecap(j, ts, text) {
  if (text) j.recap = { ts, text: clip(text, 420) };
}

/** Everything from `since` on, ready to send. */
export function journalSummary(j, since) {
  return {
    turns: j.turns.filter((t) => t.end >= since).map(({ start, end, prompt, done }) => ({ start, end, prompt, done })),
    edits: [...j.edits].filter(([, ts]) => ts >= since).map(([file, ts]) => ({ file, ts })),
    tests: j.tests.filter((t) => t.ts >= since),
    tokens: j.tokens.get(dayKey(since)) || 0,
    recap: j.recap && j.recap.ts >= since ? j.recap : null,
  };
}
