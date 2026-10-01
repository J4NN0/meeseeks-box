import { DESK_COUNT } from '../world/index.js';

// Who sits where: the garage has CAPACITY desks, and everyone who doesn't fit
// works in the Microverse inside Rick's car battery, then in the Miniverse
// inside that one, and so on. Level 0 is the garage.
//
// Desks upstairs go to whoever matters most right now: agents waiting on you,
// then working ones, then nappers. Agents only move when someone clearly more
// important (a better tier, not just more recent) is stuck deeper down, and
// never before they've been somewhere for MIN_STAY_MS, so nobody ping-pongs.

export const CAPACITY = DESK_COUNT;
const MIN_STAY_MS = 20_000;
// A session missing from one poll keeps its seat for a moment: polls flake.
const GRACE_MS = 5000;

const TIERS = { waiting: 0, working: 1, sleeping: 2 };
const tier = (s) => TIERS[s.status] ?? 1;

/** Sorts the more important session first. */
function compare(a, b) {
  const t = tier(a) - tier(b);
  if (t) return t;
  // Longest wait first; otherwise whoever did something most recently.
  if (tier(a) === 0) return (a.statusSince || 0) - (b.statusSince || 0);
  return (b.lastActivityAt || 0) - (a.lastActivityAt || 0);
}

const bySession = (a, b) => compare(a.session, b.session);

export class Seating {
  constructor() {
    /** id -> { session, level, since, missingSince } */
    this.seats = new Map();
  }

  /**
   * Seats the latest sessions. Returns the sessions per level, which agents
   * changed level (id -> { from, to }), which are new and which are gone.
   */
  update(sessions, now) {
    const before = new Map([...this.seats].map(([id, seat]) => [id, seat.level]));
    const incoming = new Map(sessions.map((s) => [s.id, s]));
    const gone = [];
    for (const [id, seat] of this.seats) {
      const session = incoming.get(id);
      if (session) {
        seat.session = session;
        seat.missingSince = 0;
        continue;
      }
      seat.missingSince ||= now;
      if (now - seat.missingSince > GRACE_MS) {
        this.seats.delete(id);
        gone.push(id);
      }
    }

    const fresh = sessions.filter((s) => !this.seats.has(s.id)).sort(compare);
    for (const session of fresh) this.seats.set(session.id, { session, level: this.firstFree(), since: now, missingSince: 0 });
    this.rebalance(now);

    const levels = [[]];
    const moves = new Map();
    for (const [id, seat] of this.seats) {
      while (levels.length <= seat.level) levels.push([]);
      levels[seat.level].push(seat.session);
      const from = before.get(id);
      if (from !== undefined && from !== seat.level) moves.set(id, { from, to: seat.level });
    }
    return { levels, moves, arrivals: new Set(fresh.map((s) => s.id)), gone };
  }

  firstFree() {
    const counts = [];
    for (const seat of this.seats.values()) counts[seat.level] = (counts[seat.level] || 0) + 1;
    let level = 0;
    while ((counts[level] || 0) >= CAPACITY) level++;
    return level;
  }

  rebalance(now) {
    const move = (seat, level) => {
      seat.level = level;
      seat.since = now;
    };
    // Each step either fills a gap upstairs or swaps a better tier up, so
    // this settles; the cap is only a safety net.
    for (let step = 0; step < 1000; step++) {
      const levels = [];
      for (const seat of this.seats.values()) (levels[seat.level] ||= []).push(seat);
      let changed = false;
      for (let level = 0; level < levels.length - 1 && !changed; level++) {
        const here = levels[level] || [];
        // Sessions that just vanished are about to leave: don't move them.
        const deeper = levels.slice(level + 1).flat().filter((s) => !s.missingSince).sort(bySession);
        const best = deeper[0];
        if (!best) break;
        if (here.length < CAPACITY) {
          move(best, level);
          changed = true;
          break;
        }
        const settled = here.filter((s) => !s.missingSince && now - s.since >= MIN_STAY_MS).sort(bySession);
        const worst = settled.at(-1);
        if (worst && tier(best.session) < tier(worst.session)) {
          const to = best.level;
          move(best, level);
          move(worst, to);
          changed = true;
        }
      }
      if (!changed) return;
    }
  }
}
