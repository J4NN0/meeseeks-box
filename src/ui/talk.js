// The agent panel's chat: the conversation so far (your prompts, the agent's
// replies, what it did in between), what it's waiting on you for, and a box
// to send it your next prompt. Sending, and answering a permission prompt,
// work for Claude Code sessions started with the box's channel
// (bin/claude-box); for the rest the chat is read-only and says how to
// reopen the session so you can talk to it.
//
// A Meeseeks you summoned from the box (server/meeseeks.js) first asks what
// it's for: what to do and in which folder. Skip it, or close the panel
// without answering, and it's gone.

import { post } from '../data/api.js';
import { FolderPicker } from './folders.js';
import { copyFrom, esc, shellQuote } from './util.js';

const clock = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
const REFETCH_MS = 5000;
const MAX_PREVIEW = 1200;
/** How long a message you sent waits to show up in the transcript before it's shown on its own. */
const MATCH_WINDOW_MS = 10 * 60_000;

/** Just enough Markdown for agent replies: code blocks, inline code, bold, headings. */
function renderText(text) {
  return String(text || '')
    .split(/```[^\n]*\n?/)
    .map((part, i) => {
      if (i % 2) return `<pre><code>${esc(part.replace(/\n$/, ''))}</code></pre>`;
      const body = part.trim();
      if (!body) return '';
      return `<p>${esc(body)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/^#{1,6} (.+)$/gm, '<b>$1</b>')}</p>`;
    })
    .join('');
}

export class Talk {
  /**
   * `box`: { folders() to offer, most likely first; remember(folder) one you
   * used; refresh() the sessions now; gone(id), one you sent away;
   * failed(message), sending it away didn't work; close() the panel }.
   */
  constructor({ box } = {}) {
    this.box = box;
    this.answered = new Set(); // permission prompts answered from here
    this.told = new Set(); // box Meeseeks you gave a task or sent away
    this.giving = new Set(); // box Meeseeks with a task, or a dismissal, on its way
    this.agent = null;
    this.el = null;
    this.chat = [];
    this.launcher = '';
    this.fetchedFor = '';
    this.fetchedAt = 0;
    this.fetching = false;
    this.convoKey = '';
    this.waitKey = '';
    this.footKey = '';
    this.drafts = new Map(); // session id → what you'd started typing
    this.sent = new Map(); // session id → messages you sent, until the transcript has them
    this.visible = false;
  }

  /** Builds the chat for `agent` inside `el` (the panel's chat tab). */
  mount(el, agent) {
    // The same one again (clicked while its panel is open) isn't left, and keeps what you'd typed.
    const again = this.agent?.id === agent.id && this.task ? { text: this.task.value, folder: this.folder.value } : null;
    if (!again) this.leave();
    this.agent = agent;
    this.el = el;
    this.chat = [];
    this.fetchedFor = '';
    this.convoKey = this.waitKey = this.footKey = '';
    this.scrolledOnce = false;
    el.innerHTML = `
      <div class="convo"><ol></ol></div>
      <div class="waiting" hidden></div>
      <div class="foot">
        <form class="summon" hidden>
          <textarea rows="3" placeholder="What should it do?" aria-label="What it should do"></textarea>
          <div class="picker"></div>
          <small class="error" hidden></small>
          <div class="go"><button type="button" class="skip">Skip</button><button type="submit">Caaan do!</button></div>
        </form>
        <form class="compose" hidden>
          <textarea rows="2" placeholder="Your next prompt…" aria-label="Your next prompt"></textarea>
          <button type="submit">Send</button>
        </form>
        <div class="connect" hidden></div>
        <button type="button" class="poof" hidden>✨ Send it away</button>
      </div>`;
    this.convo = el.querySelector('.convo');
    this.list = el.querySelector('.convo ol');
    this.waitEl = el.querySelector('.waiting');
    this.form = el.querySelector('.compose');
    this.input = el.querySelector('.compose textarea');
    this.connectEl = el.querySelector('.connect');
    this.summon = el.querySelector('.summon');
    this.task = this.summon.querySelector('textarea');
    const known = this.box?.folders() || [];
    this.task.value = again?.text || '';
    this.folder = new FolderPicker(this.summon.querySelector('.picker'), { value: again?.folder ?? known[0] ?? '', known: known.slice(0, 6) });
    this.summonError = this.summon.querySelector('.error');
    this.poofBtn = el.querySelector('.poof');
    this.task.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.give();
      }
    });
    this.summon.addEventListener('submit', (e) => {
      e.preventDefault();
      this.give();
    });
    this.summon.querySelector('.skip').addEventListener('click', () => {
      this.skip();
      this.box?.close();
    });
    this.poofBtn.addEventListener('click', () => {
      this.dismiss();
      this.box?.close();
    });
    this.input.value = this.drafts.get(agent.id) || '';

    this.input.addEventListener('input', () => {
      this.drafts.set(this.agent.id, this.input.value);
      this.grow();
    });
    this.input.addEventListener('keydown', (e) => {
      // Enter sends; Shift+Enter is a new line (and so is Enter mid-composition).
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.send();
      }
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });
    el.addEventListener('click', (e) => {
      const verdict = e.target.closest('[data-verdict]');
      if (verdict) this.decide(verdict.dataset.request, verdict.dataset.verdict);
      const copy = e.target.closest('[data-copy]');
      if (copy) copyFrom(copy);
    });
    this.grow();
  }

  /** Called with each refresh of the panel (twice a second). */
  update(now) {
    const s = this.agent?.session;
    if (!s || !this.el) return;
    if (this.visible) this.refresh(now);
    this.renderConvo();
    this.renderWaiting();
    this.renderFoot();
  }

  /** Re-reads the conversation when the session did something, and now and then anyway. */
  refresh(now) {
    const s = this.agent.session;
    const key = `${s.id}:${s.lastActivityAt}:${s.activity.length}:${s.activity.at(-1)?.ts}`;
    if (this.fetching || (key === this.fetchedFor && now - this.fetchedAt < REFETCH_MS)) return;
    this.fetching = true;
    this.fetchedAt = now;
    const id = s.id;
    fetch(`/api/chat?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || this.agent?.id !== id) return;
        this.chat = data.chat || [];
        this.launcher = data.launcher || '';
        this.fetchedFor = key;
        this.renderConvo();
        this.renderFoot();
      })
      .catch(() => {})
      .finally(() => { this.fetching = false; });
  }

  /** Your messages the transcript doesn't show yet, oldest first. */
  unmatched() {
    const list = this.sent.get(this.agent.id) || [];
    const yours = this.chat.filter((e) => e.who === 'you');
    // The transcript keeps the start of a long message.
    const same = (a, b) => a.slice(0, 200) === b.slice(0, 200);
    const left = list.filter((m) => !yours.some((e) => same(e.text, m.text) && e.ts >= m.ts - 5000 && e.ts - m.ts < MATCH_WINDOW_MS));
    if (left.length !== list.length) this.sent.set(this.agent.id, left);
    return left;
  }

  renderConvo() {
    const pending = this.unmatched();
    const key = JSON.stringify([this.agent.id, this.agent.session.status, this.chat.length, this.chat.at(-1)?.ts, this.chat.at(-1)?.text?.length, this.chat.at(-1)?.steps, pending.map((m) => m.state)]);
    if (key === this.convoKey) return;
    this.convoKey = key;
    const busy = this.agent.session.status === 'working';
    const sentLabel = busy ? 'Sent: it reads this once it’s done with what it’s on' : 'Sent';
    const entries = [...this.chat.map((e) => ({ ...e })), ...pending.map((m) => ({ ...m, who: 'you', mine: true }))].sort((a, b) => a.ts - b.ts);
    const items = entries.map((e) => {
      if (e.who === 'did') return `<li class="did">${didLine(e)}</li>`;
      const via = e.via ? (e.via === 'meeseeks' ? ' · from the box' : ` · via ${esc(e.via)}`) : '';
      const state = e.mine ? `<em class="state ${e.state}">${esc(e.state === 'failed' ? `Not sent: ${e.error}` : e.state === 'sending' ? 'Sending…' : sentLabel)}</em>` : '';
      const who = e.who === 'you' ? `You${via}` : 'Meeseeks';
      return `<li class="${e.who}${e.mine ? ' mine' : ''}"><div class="who"><b>${who}</b><time>${clock(e.ts)}</time></div><div class="text">${renderText(e.text)}</div>${state}</li>`;
    });
    const nearBottom = this.convo.scrollHeight - this.convo.scrollTop - this.convo.clientHeight < 60;
    this.list.innerHTML = items.join('') || `<li class="empty">${this.emptyText()}</li>`;
    if (nearBottom || !this.scrolledOnce) {
      this.convo.scrollTop = this.convo.scrollHeight;
      this.scrolledOnce = entries.length > 0;
    }
  }

  /** What it's waiting on you for: a permission you can answer here, or something only the terminal can. */
  renderWaiting() {
    const s = this.agent.session;
    const permission = s.talk?.permission && !this.answered.has(s.talk.permission.requestId) ? s.talk.permission : null;
    const ask = s.ask;
    const key = JSON.stringify([permission, ask]);
    if (key === this.waitKey) return;
    this.waitKey = key;
    let html = '';
    if (permission) {
      const input = permission.input.length > MAX_PREVIEW ? `${permission.input.slice(0, MAX_PREVIEW)}…` : permission.input;
      html = `
        <strong>🔐 Wants to use ${esc(permission.tool)}</strong>
        ${permission.description ? `<p>${esc(permission.description)}</p>` : ''}
        ${input ? `<pre>${esc(input)}</pre>` : ''}
        <div class="verdicts">
          <button type="button" class="allow" data-verdict="allow" data-request="${esc(permission.requestId)}">Allow</button>
          <button type="button" class="deny" data-verdict="deny" data-request="${esc(permission.requestId)}">Deny</button>
        </div>`;
    } else if (ask?.kind === 'question') {
      html = `<strong>🙋 It’s asking you</strong><p>${esc(ask.text)}</p><small>${s.box ? 'Answer it below.' : 'Answer it in the terminal: questions don’t reach the box.'}</small>`;
    } else if (ask?.kind === 'plan') {
      html = `<strong>🗺️ It wants you to approve a plan</strong><small>${s.box ? 'Tell it below whether to go ahead.' : 'Do that in the terminal: plans don’t reach the box.'}</small>`;
    } else if (ask?.kind === 'tool') {
      // A box Meeseeks between turns isn't running: it stopped before the tool did.
      const where = s.box ? 'It stopped before that ran: tell it below to try again.' : s.talk?.enabled ? 'Waiting for the prompt to reach the box…' : 'Answer it in the terminal.';
      html = `<strong>🔐 It wants to run something</strong><pre>${esc(ask.text)}</pre><small>${where}</small>`;
    }
    this.waitEl.hidden = !html;
    this.waitEl.innerHTML = html;
  }

  /** The composer, or how to reopen the session so you can use it; for a box Meeseeks with nothing to do, its task. */
  renderFoot() {
    const s = this.agent.session;
    const canTalk = !!s.talk?.enabled;
    const asking = s.box?.state === 'new';
    const key = JSON.stringify([s.id, s.provider, canTalk, !!s.talk, this.launcher, s.cwd, s.box?.state]);
    if (key === this.footKey) return;
    this.footKey = key;
    this.summon.hidden = !asking;
    // Skip sends a new one away; once it has a task, this does.
    this.poofBtn.hidden = !s.box || asking;
    this.form.hidden = !canTalk || asking;
    this.connectEl.hidden = canTalk || asking;
    if (canTalk || asking) return;
    if (s.provider !== 'claude') {
      this.connectEl.innerHTML = '<p>Talking to it from here works with Claude Code sessions only.</p>';
      return;
    }
    const rawId = s.id.split(':').slice(1).join(':');
    const launcher = this.launcher || 'bin/claude-box';
    const reopen = `cd ${shellQuote(s.cwd)} && ${shellQuote(launcher)} --resume ${rawId}`;
    const why = s.talk ? 'Its session was started without the channel switched on.' : 'To talk to it from here, its session needs the box’s channel.';
    this.connectEl.innerHTML = `
      <p>${why} Quit it in the terminal, then reopen it with:</p>
      <div class="cmd"><code>${esc(reopen)}</code><button type="button" data-copy="${esc(reopen)}">Copy</button></div>
      <p class="new">For new sessions, run <code>${esc(launcher)}</code> instead of <code>claude</code>.</p>`;
  }

  async send() {
    const s = this.agent?.session;
    const text = this.input.value.trim();
    if (!s?.talk?.enabled || !text) return;
    const id = s.id;
    const msg = { ts: Date.now(), text, state: 'sending' };
    // A failed one gave its text back to the composer: no need to keep showing it.
    this.sent.set(id, [...(this.sent.get(id) || []).filter((m) => m.state !== 'failed'), msg]);
    this.input.value = '';
    this.drafts.delete(id);
    this.grow();
    this.renderConvo();
    try {
      await post('/api/talk', { id, text });
      msg.state = 'sent';
    } catch (e) {
      msg.state = 'failed';
      msg.error = e.message;
      // Give the text back to fix and resend, unless you've started on another.
      if (this.agent?.id === id && !this.input.value) {
        this.input.value = text;
        this.drafts.set(id, text);
        this.grow();
      }
    }
    if (this.agent?.id === id) this.renderConvo();
    this.fetchedAt = 0;
  }

  async decide(requestId, behavior) {
    const s = this.agent?.session;
    if (!s || !requestId) return;
    for (const b of this.waitEl.querySelectorAll('button')) b.disabled = true;
    try {
      await post('/api/permission', { id: s.id, requestId, behavior });
      this.answered.add(requestId);
      this.renderWaiting();
    } catch (e) {
      if (/already been answered/.test(e.message)) {
        this.answered.add(requestId);
        this.renderWaiting();
        return;
      }
      // Something passing (the link isn't up yet, the network): try again.
      for (const b of this.waitEl.querySelectorAll('button')) b.disabled = false;
      this.waitEl.querySelector('.error')?.remove();
      this.waitEl.querySelector('.verdicts')?.insertAdjacentHTML('afterend', `<small class="error">${esc(e.message)}</small>`);
    }
  }

  emptyText() {
    const state = this.agent.session.box?.state;
    if (state === 'new') return 'I’m Mr. Meeseeks! Look at me! What do you need? Tell me, or skip me and *poof*.';
    return this.fetchedFor ? 'Nothing said yet.' : 'Loading the conversation…';
  }

  /** A box Meeseeks' first task, in the folder you named. */
  async give() {
    const s = this.agent?.session;
    const text = this.task.value.trim();
    const cwd = this.folder.value;
    if (!s?.box || !text || this.giving.has(s.id)) return;
    const id = s.id;
    const here = () => this.agent?.id === id;
    this.giving.add(id);
    this.summonError.hidden = true;
    for (const b of this.summon.querySelectorAll('button')) b.disabled = true;
    try {
      const done = await post('/api/box/run', { id, text, cwd });
      this.told.add(id);
      this.box?.remember(done.cwd || cwd);
      this.sent.set(id, [{ ts: Date.now(), text, state: 'sent' }]);
      if (here()) this.task.value = '';
      this.box?.refresh();
    } catch (e) {
      if (here()) {
        this.summonError.textContent = e.message;
        this.summonError.hidden = false;
      }
    } finally {
      this.giving.delete(id);
      if (here()) for (const b of this.summon.querySelectorAll('button')) b.disabled = false;
    }
  }

  /** Nothing for it to do: *poof*. */
  skip(agent = this.agent) {
    const s = agent?.session;
    if (s?.box?.state !== 'new' || this.told.has(s.id) || this.giving.has(s.id)) return;
    this.dismiss(agent);
  }

  /** Closing its panel (or opening another) without telling it anything skips it. */
  leave() {
    if (this.agent) this.skip(this.agent);
  }

  dismiss(agent = this.agent) {
    const s = agent?.session;
    if (!s?.box || this.giving.has(s.id)) return;
    const id = s.id;
    this.giving.add(id);
    post('/api/box/dismiss', { id })
      .then(() => {
        this.told.add(id);
        this.box?.gone(id);
      }, (e) => this.box?.failed(e.message))
      .finally(() => this.giving.delete(id));
  }

  /** The textarea grows with what you type, up to a few lines. */
  grow() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 160)}px`;
  }

  focus() {
    if (!this.summon.hidden) this.task.focus();
    else if (!this.form.hidden) this.input.focus();
  }
}

function didLine(e) {
  const parts = [`🔧 ${e.steps} step${e.steps === 1 ? '' : 's'}`];
  if (e.files.length) parts.push(`✏️ ${e.files.map(esc).join(', ')}${e.moreFiles ? ` and ${e.moreFiles} more` : ''}`);
  if (e.commands) parts.push(`⌨️ ${e.commands} command${e.commands === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
