import * as THREE from 'three';
import { World } from './world/index.js';
import { verse } from './world/verses.js';
import { AgentManager } from './agents/manager.js';
import { Seating } from './agents/seating.js';
import { agentColor, mascotKind } from './characters/index.js';
import { disposeScene } from './engine/dispose.js';
import { visualStatus } from './status.js';

// The garage and the universes in its car battery. A universe only opens
// when the office above it is full, and costs nothing until you visit it:
// until then it's a list of who works there. Visiting builds its scene
// (behind the transition), only the office you're in is drawn and animated,
// and one you left is freed a minute later.
//
// A meeting is called everywhere at once: in every universe the agents go
// to their own meeting room, and the ones in the others join on screen.

const KEEP_WARM_MS = 60_000;

class Universe {
  constructor(level) {
    this.level = level;
    this.verse = verse(level);
    this.sessions = [];
    this.scene = null;
    this.world = null;
    this.manager = null;
    this.leftAt = 0;
  }

  get built() {
    return !!this.scene;
  }

  build({ boards, mode, onClick, onEnterGate }) {
    this.scene = new THREE.Scene();
    this.world = new World(this.scene, { level: this.level, boards, onEnterGate });
    this.manager = new AgentManager(this.world, { onClick });
    this.manager.mode = mode;
  }

  dispose(keep) {
    this.manager.clear();
    disposeScene(this.scene, { keep });
    this.scene = this.world = this.manager = null;
  }

  /** The label renderer only touches the scene it draws, so hide ours. */
  hideLabels() {
    this.scene?.traverse((o) => {
      if (o.isCSS2DObject) o.element.style.display = 'none';
    });
  }
}

export class Multiverse {
  /**
   * `onEvent(type, agent)` for spawn / leave / waiting, wherever the agent
   * is; `onEnterGate(level)` when a battery tag is clicked; `onCollapse()`
   * when the universe you're in is no longer needed.
   */
  constructor({ boards, mode, onEvent, onClick, onEnterGate, onCollapse }) {
    this.boards = boards;
    this.keep = new Set([boards.dashboard.texture, boards.whiteboard.texture]);
    this.mode = mode;
    this.onEvent = onEvent;
    this.onClick = onClick;
    this.onEnterGate = onEnterGate;
    this.onCollapse = onCollapse;
    this.seating = new Seating();
    /**
     * Every agent, wherever it works: what the HUD and the boards list.
     * id -> { id, session, colorHex, level, where, kind, visualStatus }
     */
    this.records = new Map();
    this.universes = [new Universe(0)];
    this.needed = 1;
    this.active = this.universes[0];
    this.meeting = false;
    this.build(this.active);
  }

  build(universe) {
    universe.build({ boards: this.boards, mode: this.mode, onClick: this.onClick, onEnterGate: this.onEnterGate });
    universe.manager.meeting = this.meeting;
  }

  /**
   * Calls a meeting, or ends it: everyone goes to the meeting room (the
   * office you're in walks there, the others are there already), and back.
   */
  setMeeting(on) {
    if (on === this.meeting) return;
    this.meeting = on;
    for (const u of this.universes) if (u.built) u.manager.setMeeting(on, { instant: u !== this.active });
    this.holdSeats();
  }

  /** Nobody changes universe while there's a meeting, or anyone's still on their way back from one. */
  holdSeats() {
    this.seating.hold = this.meeting || this.universes.some((u) => u.built && u.manager.busy);
  }

  /** The other universes on the call, for the meeting room's screens: who's in each. */
  calls(now) {
    if (!this.meeting) return [];
    return this.universes
      .filter((u) => u !== this.active && u.level < this.needed && u.sessions.length)
      .map((u) => ({
        level: u.level,
        name: u.verse.name,
        color: u.verse.neon,
        agents: u.sessions.map((s) => this.records.get(s.id)).filter(Boolean).map((r) => {
          r.visualStatus = visualStatus(r.session, now);
          return r;
        }),
      }));
  }

  isOpen(level) {
    return level >= 0 && level < this.needed;
  }

  sync(sessions, now) {
    this.holdSeats();
    const { levels, moves, arrivals, gone } = this.seating.update(sessions, now);
    this.needed = levels.length;

    for (const id of gone) {
      const record = this.records.get(id);
      this.records.delete(id);
      if (record) this.onEvent?.('leave', record);
    }
    levels.forEach((list, level) => {
      for (const s of list) {
        let record = this.records.get(s.id);
        const was = record?.session.status;
        if (!record) {
          record = { id: s.id, session: s, colorHex: `#${agentColor(s.provider, s.id).getHexString()}` };
          this.records.set(s.id, record);
        }
        record.session = s;
        record.level = level;
        record.where = level ? verse(level).name : '';
        record.kind = mascotKind(this.mode, s);
        record.visualStatus = visualStatus(s, now);
        if (arrivals.has(s.id)) this.onEvent?.('spawn', record);
        else if (was !== 'waiting' && s.status === 'waiting') this.onEvent?.('waiting', record);
      }
    });

    while (this.universes.length < levels.length) this.universes.push(new Universe(this.universes.length));
    this.universes.forEach((u, level) => {
      u.sessions = levels[level] || [];
      if (!u.built) return;
      const departures = new Map();
      const entries = new Map();
      for (const [id, m] of moves) {
        if (m.from === level) departures.set(id, m.to > level ? 'down' : 'up');
        if (m.to === level) entries.set(id, m.from > level ? 'battery' : 'box');
      }
      u.manager.sync(u.sessions, now, { instant: u !== this.active, departures, entries });
    });
    this.closeUnneeded();
    this.updateBatteries();
    if (this.active.level >= this.needed) this.onCollapse?.();
  }

  /** Builds the universe if it isn't, and makes it the one on screen. */
  enter(level, now) {
    const to = this.universes[level];
    if (!to || to === this.active) return;
    if (!to.built) {
      this.build(to);
      to.manager.sync(to.sessions, now, { instant: true });
    }
    // It stops animating once you leave: settle mid-walk exits, the spawn
    // queue and walks to and from a meeting now, or they'd freeze until you
    // come back.
    this.active.manager.sync(this.active.sessions, now, { instant: true });
    this.active.manager.settleMeeting();
    this.active.world.effects.clear();
    this.active.hideLabels();
    this.active.leftAt = now;
    this.active = to;
    this.updateBatteries();
    this.closeUnneeded();
  }

  tick(dt, t, now, camera) {
    this.active.world.update(dt, t, now, camera);
    this.active.manager.tick(dt, t, now, camera);
    for (const u of this.universes) {
      if (u !== this.active && u.level > 0 && u.built && now - u.leftAt > KEEP_WARM_MS) u.dispose(this.keep);
    }
  }

  /** Universes past the last one needed close, unless you're standing in one. */
  closeUnneeded() {
    while (this.universes.length > this.needed && this.universes.at(-1) !== this.active) {
      const u = this.universes.pop();
      if (u.built) u.dispose(this.keep);
    }
  }

  updateBatteries() {
    for (const u of this.universes) {
      if (!u.built) continue;
      // Only the universe right inside: the one the tag names.
      const inside = u.level + 1 < this.needed ? this.universes[u.level + 1].sessions : [];
      u.world.battery.set({ open: u.level + 1 < this.needed, count: inside.length, waiting: inside.filter((s) => s.status === 'waiting').length });
    }
  }

  setMode(mode) {
    this.mode = mode;
    for (const u of this.universes) if (u.built) u.manager.setMode(mode);
    for (const r of this.records.values()) r.kind = mascotKind(mode, r.session);
  }

  find(id) {
    return this.records.get(id) || null;
  }

  /** You sent `id` away: it poofs with the next sync. */
  end(id) {
    this.seating.end(id);
  }

  /** Every agent in every universe, for the HUD and the wall boards. */
  roster(now) {
    const list = [...this.records.values()];
    for (const r of list) r.visualStatus = visualStatus(r.session, now);
    return list;
  }

  /** The open universes with headcounts, for the breadcrumb. */
  summary() {
    const count = Math.max(this.needed, this.active.level + 1);
    return this.universes.slice(0, count).map((u) => ({
      level: u.level,
      name: u.verse.name,
      count: u.sessions.length,
      waiting: u.sessions.filter((s) => s.status === 'waiting').length,
      open: u.level < this.needed,
    }));
  }
}
