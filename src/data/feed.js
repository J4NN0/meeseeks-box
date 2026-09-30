// Polls the local scanner for running Claude Code and Codex sessions.

const POLL_MS = 2000;

export class Feed {
  constructor() {
    this.sessions = [];
    this.state = 'connecting'; // connecting | live | offline
    this.failures = 0;
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
      const res = await fetch('/api/sessions', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.sessions = data.sessions || [];
      this.failures = 0;
      this.state = 'live';
    } catch {
      this.failures++;
      if (this.failures >= 2) {
        this.state = 'offline';
        this.sessions = [];
      }
    }
    this.emit();
  }

  emit() {
    for (const fn of this.listeners) fn(this.sessions, this.state);
  }
}
