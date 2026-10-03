import { Agent } from './agent.js';

// Keeps one office in sync with the sessions seated in it: new sessions
// spawn an agent, vanished ones poof. The multiverse decides who sits where
// (and smooths over flaky polls), so whatever isn't in the list leaves now.
// During a meeting everyone here goes to the meeting room, newcomers too.

const SPAWN_STAGGER_S = 1.3;
/** Called to (or out of) a meeting, they get up one after another, this far apart. */
const MEETING_STAGGER_S = 0.28;

export class AgentManager {
  constructor(world, { onClick } = {}) {
    this.world = world;
    this.agents = new Map();
    this.mode = 'meeseeks';
    this.onClick = onClick;
    this.queue = [];
    this.spawnCooldown = 0;
    this.meeting = false;
  }

  /**
   * Calls everyone to the meeting room, or sends them back to their desks.
   * `instant` puts them straight there (an office you aren't looking at).
   */
  setMeeting(on, { instant = false } = {}) {
    this.meeting = on;
    if (instant) {
      this.settleMeeting();
      return;
    }
    let i = 0;
    for (const agent of this.agents.values()) agent.cue = i++ * MEETING_STAGGER_S + Math.random() * 0.2;
  }

  /** Everyone who's on the way to or from the meeting gets there now. */
  settleMeeting() {
    for (const agent of this.agents.values()) {
      if (agent.phase === 'rising') agent.stoodUp();
      if (this.meeting && agent.canJoin) this.join(agent, true);
      else if (this.meeting && agent.inMeeting && agent.phase !== 'meeting') agent.takePlace();
      else if (!this.meeting && agent.inMeeting) agent.leaveMeeting({ instant: true });
      else if (agent.returning) agent.settle(Date.now());
    }
  }

  join(agent, instant = false) {
    agent.joinMeeting(this.world.claimMeetingPlace(agent), { instant });
  }

  /** Someone's still in the meeting room, or on the way back from it. */
  get busy() {
    for (const agent of this.agents.values()) if (agent.place || agent.returning) return true;
    return false;
  }

  /**
   * `instant` skips every animation (for offices you aren't looking at).
   * `departures` says why an agent left (id -> 'down' | 'up', default
   * 'ended'); `entries` how an arrival comes in (id -> 'box' | 'battery').
   */
  sync(sessions, now, { instant = false, departures, entries } = {}) {
    const incoming = new Map(sessions.map((s) => [s.id, s]));
    for (const [id, agent] of this.agents) {
      const outgoing = agent.phase === 'leaving' || agent.phase === 'departing' || agent.phase === 'gone';
      if (incoming.has(id) && !outgoing) continue;
      // Offices you aren't in don't animate, so finish any exit right away
      // (and re-spawn below if the session was seated back here).
      if (instant) {
        agent.destroy();
        this.agents.delete(id);
      } else if (!outgoing) {
        agent.leave(departures?.get(id));
      }
    }
    this.queue = this.queue.filter((q) => incoming.has(q.session.id));
    for (const s of sessions) {
      const agent = this.agents.get(s.id);
      if (agent) {
        if (agent.phase !== 'leaving' && agent.phase !== 'departing' && agent.phase !== 'gone') agent.update(s);
        continue;
      }
      if (instant) {
        this.queue = this.queue.filter((q) => q.session.id !== s.id);
        this.spawn(s, now, { instant: true });
        continue;
      }
      const queued = this.queue.find((q) => q.session.id === s.id);
      if (queued) queued.session = s;
      else this.queue.push({ session: s, entry: entries?.get(s.id) || 'box' });
    }
  }

  spawn(session, now, opts) {
    const agent = new Agent(session, this.world, { mode: this.mode, onClick: this.onClick, now, ...opts });
    this.agents.set(session.id, agent);
    // Built mid-meeting while you weren't looking: it's already in there.
    if (opts?.instant && this.meeting) this.join(agent, true);
    return agent;
  }

  setMode(mode) {
    this.mode = mode;
    for (const a of this.agents.values()) a.setMascot(mode);
  }

  tick(dt, t, now, camera) {
    // Spawn one at a time so a page load with ten sessions becomes a parade.
    this.spawnCooldown -= dt;
    if (this.queue.length && this.spawnCooldown <= 0) {
      const { session, entry } = this.queue.shift();
      this.spawn(session, now, { entry });
      this.spawnCooldown = SPAWN_STAGGER_S;
    }
    for (const [id, agent] of this.agents) {
      if (this.meeting ? agent.canJoin : agent.inMeeting) {
        agent.cue -= dt;
        if (agent.cue <= 0) {
          if (this.meeting) this.join(agent);
          else agent.leaveMeeting();
        }
      }
      agent.tick(dt, t, now, camera);
      if (agent.phase === 'gone') this.agents.delete(id);
      else if (agent.phase === 'walking' || agent.phase === 'convening' || agent.phase === 'departing') this.world.passing(agent.character.root.position);
    }
    const lounger = [...this.agents.values()].find((a) => a.phase === 'lounging');
    const desk = lounger && this.world.fillOrder.find((d) => d.free);
    if (desk) lounger.moveToDesk(desk);
  }

  byId(id) {
    return this.agents.get(id);
  }

  /** Removes everyone at once, no poofs: the office is being torn down. */
  clear() {
    for (const agent of this.agents.values()) agent.destroy();
    this.agents.clear();
    this.queue = [];
  }
}
