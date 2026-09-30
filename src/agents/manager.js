import { Agent } from './agent.js';

// Keeps the room in sync with the list of sessions: new sessions spawn an
// agent, vanished ones poof. A short grace period stops a flaky poll from
// making Meeseeks blink in and out of existence.

const GRACE_MS = 5000;
const SPAWN_STAGGER_S = 1.3;

export class AgentManager {
  constructor(world, { onEvent, onClick } = {}) {
    this.world = world;
    this.agents = new Map();
    this.mode = 'meeseeks';
    this.onEvent = onEvent || (() => {});
    this.onClick = onClick;
    this.queue = [];
    this.spawnCooldown = 0;
  }

  sync(sessions, now) {
    const seen = new Set();
    for (const s of sessions) {
      seen.add(s.id);
      const agent = this.agents.get(s.id);
      if (agent && agent.phase !== 'leaving' && agent.phase !== 'gone') {
        const before = agent.session.status;
        agent.update(s);
        if (before !== 'waiting' && s.status === 'waiting') this.onEvent('waiting', agent);
      } else if (!agent) {
        const queued = this.queue.find((q) => q.id === s.id);
        if (queued) Object.assign(queued, s);
        else this.queue.push(s);
      }
    }
    this.queue = this.queue.filter((q) => seen.has(q.id));
    for (const agent of this.agents.values()) {
      if (seen.has(agent.id) || agent.phase === 'leaving' || agent.phase === 'gone') continue;
      agent.missingSince ||= now;
      if (now - agent.missingSince > GRACE_MS) {
        agent.leave();
        this.onEvent('leave', agent);
      }
    }
  }

  setMode(mode) {
    this.mode = mode;
    for (const a of this.agents.values()) a.setMascot(mode);
  }

  tick(dt, t, now, camera) {
    // Spawn one at a time so a page load with ten sessions becomes a parade.
    this.spawnCooldown -= dt;
    if (this.queue.length && this.spawnCooldown <= 0) {
      const s = this.queue.shift();
      const agent = new Agent(s, this.world, { mode: this.mode, onClick: this.onClick, now });
      this.agents.set(s.id, agent);
      this.spawnCooldown = SPAWN_STAGGER_S;
      this.onEvent('spawn', agent);
    }
    for (const [id, agent] of this.agents) {
      agent.tick(dt, t, now, camera);
      if (agent.phase === 'gone') this.agents.delete(id);
    }
    const lounger = [...this.agents.values()].find((a) => a.phase === 'lounging');
    const desk = lounger && this.world.fillOrder.find((d) => d.free);
    if (desk) lounger.moveToDesk(desk);
  }

  list() {
    return [...this.agents.values()].filter((a) => a.phase !== 'gone');
  }

  byId(id) {
    return this.agents.get(id);
  }
}
