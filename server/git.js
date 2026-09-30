// Read-only git queries for the whiteboard: what's uncommitted in a project
// and what was committed today. Nothing here writes to a repository.

import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const MAX_FILES = 200;
const MAX_COUNTED = 100;
const COUNT_LIMIT = 1024 * 1024;

// GIT_OPTIONAL_LOCKS=0 keeps `git status` from refreshing (writing) the index
// while an agent may be committing. The -c flags stop config (the repo's own,
// which an agent can write) from running programs on our behalf: fsmonitor and
// signature checks here, clean/smudge filters in `filterOverrides`, and diff
// drivers via --no-ext-diff/--no-textconv at each call.
const ENV = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
const SAFE = ['-c', 'core.fsmonitor=false', '-c', 'log.showSignature=false', '-c', 'core.quotepath=false', '-c', 'color.ui=false'];

async function git(cwd, args, extra = []) {
  const { stdout } = await exec('git', [...SAFE, ...extra, ...args], { cwd, env: ENV, timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/**
 * Blanks every configured filter driver: `git status` and `git diff` would
 * otherwise run a driver's clean/process command on changed files. An empty
 * command means "no filter" to git. Reading config runs nothing.
 */
async function filterOverrides(root) {
  const names = await git(root, ['config', '--name-only', '--get-regexp', '^filter\\.']).catch(() => '');
  const drivers = new Set();
  for (const key of names.split('\n')) {
    const m = /^filter\.(.+)\.[^.]+$/.exec(key.trim());
    if (m) drivers.add(m[1]);
  }
  return [...drivers].flatMap((d) => ['clean=', 'smudge=', 'process=', 'required=false'].flatMap((v) => ['-c', `filter.${d}.${v}`]));
}

const roots = new Map();
/** The repository root containing `cwd`, or null when it isn't in one. */
export async function repoRoot(cwd) {
  const hit = roots.get(cwd);
  if (hit && Date.now() - hit.at < 60_000) return hit.root;
  let root = null;
  try { root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim() || null; } catch { /* not a repo, or gone */ }
  roots.set(cwd, { root, at: Date.now() });
  return root;
}

function numstat(text) {
  const out = new Map();
  for (const line of text.split('\n')) {
    const [a, d, file] = line.split('\t');
    if (!file) continue;
    out.set(file, { added: a === '-' ? 0 : Number(a) || 0, removed: d === '-' ? 0 : Number(d) || 0 });
  }
  return out;
}

async function countLines(file) {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile() || st.size > COUNT_LIMIT) return 0;
    const buf = await fsp.readFile(file);
    if (buf.subarray(0, 8000).includes(0)) return 0; // binary
    let n = 0;
    for (const b of buf) if (b === 10) n++;
    return n + (buf.length && buf[buf.length - 1] !== 10 ? 1 : 0);
  } catch {
    return 0;
  }
}

async function uncommitted(root) {
  const noFilters = await filterOverrides(root);
  const [status, diff] = await Promise.all([
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], noFilters),
    // A brand-new repo has no HEAD yet; then only untracked files count.
    git(root, ['diff', 'HEAD', '--numstat', '--no-ext-diff', '--no-textconv', '--no-renames'], noFilters).catch(() => ''),
  ]);
  const stats = numstat(diff);
  const entries = [];
  const parts = status.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    const code = e.slice(0, 2);
    if (code[0] === 'R' || code[0] === 'C') i++; // followed by the old path
    entries.push({ path: e.slice(3), code: code.trim() || code });
  }
  let counted = 0;
  const files = await Promise.all(entries.map(async (f) => {
    const s = stats.get(f.path);
    if (s) return { ...f, ...s };
    if (f.code === '??' && counted++ < MAX_COUNTED) return { ...f, added: await countLines(path.join(root, f.path)), removed: 0 };
    return { ...f, added: 0, removed: 0 };
  }));
  const sum = (k) => files.reduce((n, f) => n + f[k], 0);
  return { files: files.length, added: sum('added'), removed: sum('removed'), list: files.slice(0, MAX_FILES) };
}

async function commitsSince(root, since) {
  const log = await git(root, [
    'log', `--since=${new Date(since).toISOString()}`, '--no-merges', '--numstat', '--no-ext-diff', '--no-textconv', '--no-renames',
    '--format=%x1e%h%x1f%ct%x1f%s',
  ]).catch(() => '');
  return log.split('\x1e').filter(Boolean).map((chunk) => {
    const [head, ...rest] = chunk.split('\n');
    const [hash, ct, subject] = head.split('\x1f');
    const stats = [...numstat(rest.join('\n')).values()];
    return {
      hash,
      ts: Number(ct) * 1000,
      subject,
      files: stats.length,
      added: stats.reduce((n, s) => n + s.added, 0),
      removed: stats.reduce((n, s) => n + s.removed, 0),
    };
  });
}

const states = new Map();
/** Branch, uncommitted changes and today's commits for a repo root. */
export async function repoState(root, since) {
  const hit = states.get(root);
  if (hit && hit.since === since && Date.now() - hit.at < 8000) return hit.value;
  const pending = (async () => {
    const [branch, changes, commits] = await Promise.all([
      git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).then((s) => s.trim()).catch(() => ''),
      uncommitted(root).catch(() => null),
      commitsSince(root, since),
    ]);
    return { branch: branch === 'HEAD' ? '' : branch, changes, commits };
  })();
  states.set(root, { since, at: Date.now(), value: pending });
  pending.catch(() => states.delete(root));
  return pending;
}
