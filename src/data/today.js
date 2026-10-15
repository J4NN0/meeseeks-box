// Polls the scanner for today's recap: turns, changes, tests, tokens, limits.
// Slower than the session feed; a failed poll keeps the last good data.

import { get } from './api.js';

const POLL_MS = 10_000;

export class TodayFeed {
  constructor() {
    this.data = null;
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

  async poll() {
    try {
      this.data = await get('/api/today');
      for (const fn of this.listeners) fn(this.data);
    } catch { /* keep what we had */ }
  }
}
