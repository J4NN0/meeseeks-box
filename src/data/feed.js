// Polls the local scanner for running Claude Code and Codex sessions.

import { get } from './api.js';

const POLL_MS = 2000;

export class Feed {
  constructor() {
    this.sessions = [];
    this.state = 'connecting'; // connecting | live | offline
    this.failures = 0;
    this.asked = 0; // polls sent
    this.answered = 0; // the latest poll whose answer was used
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); }

  start() {
    const loop = async () => {
      await this.poll();
      this.timer = setTimeout(loop, POLL_MS);
    };
    loop();
  }

  /** Also called between the regular ones, after a change you want to see now. */
  async poll() {
    const seq = ++this.asked;
    let sessions = null;
    try {
      sessions = (await get('/api/sessions')).sessions || [];
    } catch { /* counted below */ }
    // A poll sent later already answered: this one is older news.
    if (seq < this.answered) return;
    this.answered = seq;
    if (sessions) {
      this.sessions = sessions;
      this.failures = 0;
      this.state = 'live';
    } else if (++this.failures >= 2) {
      this.state = 'offline';
      this.sessions = [];
    }
    this.emit();
  }

  emit() {
    for (const fn of this.listeners) fn(this.sessions, this.state);
  }
}
