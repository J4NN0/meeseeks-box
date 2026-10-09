import * as THREE from 'three';
import { dampAngle } from '../engine/motion.js';
import { line } from './lines.js';

// Coffee breaks. Now and then a Meeseeks napping at its desk gets up and goes
// to the coffee bar (world/coffee-bar.js): it takes a mug off the counter,
// makes itself a coffee at the machine and drinks it, puts the mug back, eats
// a fruit if there's one left in the bowl, chats with whoever else is there,
// and goes back to its desk to carry on napping. Wanted back (its session
// wakes up, a meeting), it puts everything back and goes.
//
// A CoffeeArea is the bar's side of it, one per office: who goes when, who
// has the counter or the machine (one at a time: the others wait at their
// spot), where everyone stands, and whose turn it is to talk. A CoffeeBreak
// is one agent's, a step at a time.

/**
 * How often: once it's been asleep at its desk `nap` seconds, about once
 * every `every` seconds (`company` times as likely with someone at the bar
 * to talk to), and not again for `rest` seconds after one.
 */
const BREAKS = { nap: 30, every: 300, company: 3, rest: 120 };
/** Seconds it waits for the counter or the machine before doing without. */
const PATIENCE = 20;
/** Reaching over the counter: the hand's there at `touch`, stays till `out`, and is back by `back`. */
const REACH = { touch: 0.55, out: 0.7, back: 1.05 };
/** A sip of coffee and a bite of fruit, in seconds: up to its mouth, there, and down. */
const SIP = { up: 0.6, hold: 1.2, down: 0.6 };
const BITE = { up: 0.45, hold: 0.9, down: 0.4 };
const BITES = 3;
/** The steps at its own spot: drinking, eating, waiting its turn, chatting. */
const HANGING = new Set(['drink', 'eat', 'queue', 'linger']);

const tmp = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

export class CoffeeArea {
  constructor(world) {
    this.world = world;
    this.bar = world.room.coffeeBar.agents;
    this.stands = this.bar.stands();
    this.spots = this.stands.hang.map((at) => ({ at, agent: null }));
    // Who's at the counter and at the machine, or on the way there.
    this.taken = { counter: null, machine: null };
    this.clock = 0;
    this.chatIn = 0;
    this.last = null;
  }

  /** `agents` are everyone in the office; nobody goes while there's a `meeting`. */
  tick(dt, agents, meeting) {
    this.clock += dt;
    const all = [...agents];
    if (!meeting) this.maybeSend(dt, all);
    this.chat(dt, all);
  }

  /** Now and then one of the nappers gets up for a coffee. */
  maybeSend(dt, agents) {
    const out = agents.filter((a) => a.coffeeBreak).length;
    if (out >= this.spots.length) return;
    const odds = (dt / BREAKS.every) * (out ? BREAKS.company : 1);
    for (const a of agents) {
      if (a.napped >= BREAKS.nap && Math.random() < odds && this.send(a)) return;
    }
  }

  /** Off for a coffee, if it can go now: true if it went. */
  send(agent) {
    if (!agent.canTakeBreak) return false;
    const spot = this.spots.find((s) => !s.agent);
    if (!spot) return false;
    spot.agent = agent;
    agent.napped = -BREAKS.rest;
    agent.takeBreak(new CoffeeBreak(agent, this, spot));
    return true;
  }

  /** Where it stands to use the counter (mugs, fruit) or the machine. */
  stand(what) {
    return this.stands[what];
  }

  /** The counter or the machine, for `agent`: if nobody else has it, and (the machine) you aren't using it. */
  claim(what, agent) {
    const holder = this.taken[what];
    if (holder) return holder === agent;
    if (what === 'machine' && !this.bar.machineFree()) return false;
    this.taken[what] = agent;
    return true;
  }

  free(what, agent) {
    if (this.taken[what] === agent) this.taken[what] = null;
  }

  /** Gone back to its desk: its spot, and whatever it had a hold of, are free. */
  leave(agent, spot) {
    this.free('counter', agent);
    this.free('machine', agent);
    if (spot.agent === agent) spot.agent = null;
  }

  /** Anyone else on a break: someone to stay and chat with. */
  company(b) {
    return this.spots.some((s) => s.agent && s.agent !== b.agent);
  }

  /** The others at their spots, but `b`'s agent. */
  others(b) {
    return this.spots.filter((s) => s.agent && s.agent !== b.agent && s.agent.coffeeBreak?.hanging);
  }

  /** Which way `b` faces at its spot: towards the others there, or out into the room. */
  facing(b) {
    const others = this.others(b);
    if (!others.length) return this.stands.facing + Math.PI;
    tmp.set(0, 0, 0);
    for (const s of others) tmp.add(s.at);
    tmp.divideScalar(others.length).sub(b.spot.at);
    return Math.atan2(tmp.x, tmp.z);
  }

  /** Two or more at the bar: they take turns to say something, now and then answering. */
  chat(dt, agents) {
    const here = agents.filter((a) => a.coffeeBreak?.hanging);
    if (here.length < 2) {
      // Someone else turns up: it starts soon.
      this.chatIn = Math.min(this.chatIn, 1.5);
      return;
    }
    this.chatIn -= dt;
    if (this.chatIn > 0) return;
    const free = here.filter((a) => a !== this.last?.agent && !a.coffeeBreak.mouthFull);
    if (!free.length) return;
    const who = free[Math.floor(Math.random() * free.length)];
    const reply = !!this.last && !this.last.reply && this.clock - this.last.at < 5 && Math.random() < 0.65;
    who.say(line(reply ? 'chatReply' : 'chat'), reply ? 2 : 2.8);
    this.last = { agent: who, at: this.clock, reply };
    this.chatIn = rand(3, 4.6);
  }
}

/**
 * One agent's coffee break. It has a spot of its own in front of the bar, and
 * goes to the counter (for a mug, then a fruit, and to put the mug back) and
 * to the machine when they're free, waiting at its spot when they aren't.
 * Its steps: walk (to wherever's next, then `then`); at the counter, takeMug,
 * putMug, takeFruit; at the machine, placeMug, press, brew, collect; at its
 * spot, drink, eat, queue (waiting for the counter or the machine) and
 * linger; then done.
 */
export class CoffeeBreak {
  constructor(agent, area, spot) {
    this.agent = agent;
    this.area = area;
    this.bar = area.bar;
    this.spot = spot;
    this.step = 'walk';
    this.then = null;
    this.t = 0;
    this.mug = -1;
    this.fruit = -1;
    // What's in its hand: 'mug' or 'fruit'.
    this.carry = null;
    // Its coffee's been made (and how much is left), and what it's had or done without.
    this.brewed = false;
    this.fill = 0;
    this.had = { coffee: false, fruit: false };
    this.size = 1;
  }

  /** At its spot, drinking, eating, waiting its turn or chatting: there to talk to. */
  get hanging() {
    return HANGING.has(this.step);
  }

  /** Mid-sip or mid-bite: not about to say anything. */
  get mouthFull() {
    const c = this.agent.character;
    return c.sip > 0.05 || c.chew;
  }

  /** Off from behind its chair (`from`): the way to the bar, between the desks. */
  start(from) {
    this.next();
    return [from, ...this.agent.world.route(from, this.dest)];
  }

  /** What it needs to do next: at the counter, at the machine, or at its own spot. */
  need() {
    const { carry, had } = this;
    if (carry === 'mug') {
      if (this.brewed) return this.fill > 0 ? 'drink' : 'counter';
      return had.coffee ? 'counter' : 'machine';
    }
    if (carry === 'fruit') return 'eat';
    return had.coffee && had.fruit ? 'linger' : 'counter';
  }

  /** Off to do it, or to wait at its spot for whoever's at the counter or the machine. */
  next() {
    const need = this.need();
    if (need !== 'counter' && need !== 'machine') {
      this.goSpot(need);
      return;
    }
    if (this.area.claim(need, this.agent)) {
      this.walkTo(this.area.stand(need), need);
      return;
    }
    this.waitFor = need;
    this.waited = 0;
    this.goSpot('queue');
  }

  walkTo(to, then) {
    this.dest = to;
    this.then = then;
    this.agent.path = [to.clone()];
    this.setStep('walk');
  }

  goSpot(then) {
    if (this.agent.character.root.position.distanceTo(this.spot.at) < 0.1) this.setStep(then);
    else this.walkTo(this.spot.at, then);
  }

  setStep(step) {
    this.step = step;
    this.t = 0;
    this.target = null;
    this.touched = false;
  }

  /** In its hand now: 'mug', 'fruit' or nothing. */
  hold(what) {
    this.carry = what;
    this.agent.character.carrying = !!what;
  }

  /** Its break, a frame at a time: true once it's done and can go back to its desk. */
  tick(dt) {
    const a = this.agent;
    const c = a.character;
    this.t += dt;
    c.gesture = true;
    c.setMood('idle');
    if (this.step === 'walk') {
      c.setMode('walk');
      if (a.walkPath(dt)) this.setStep(this.then);
      return false;
    }
    c.setMode('stand');
    // Facing the counter to use it; at its spot, the others.
    const yaw = this.hanging || this.step === 'done' ? this.area.facing(this) : this.area.stands.facing;
    c.root.rotation.y = dampAngle(c.root.rotation.y, yaw, 6, dt);

    const { bar } = this;
    switch (this.step) {
      case 'counter':
        if (this.carry === 'mug') this.setStep('putMug');
        else if (!this.had.coffee && (this.mug = bar.takeMug(a)) >= 0) this.setStep('takeMug');
        else {
          if (!this.had.coffee) {
            this.had.coffee = true;
            a.say(line('noMug'), 2);
          }
          this.takeFruit();
        }
        break;
      case 'takeMug':
        if (this.reach(() => bar.mugAt(this.mug), () => this.hold('mug'))) this.away('counter');
        break;
      case 'putMug':
        if (this.reach(() => bar.mugHome(this.mug), () => {
          bar.returnMug(this.mug);
          this.hold(null);
          this.mug = -1;
        })) this.takeFruit();
        break;
      case 'takeFruit':
        if (this.reach(() => bar.fruitAt(this.fruit), () => this.hold('fruit'))) this.away('counter');
        break;
      case 'machine':
        this.setStep('placeMug');
        break;
      case 'placeMug':
        if (this.reach(() => bar.trayAt(), () => {
          if (bar.placeMug(this.mug, a)) this.hold(null);
        })) {
          // You got there first: back to wait for it.
          if (this.carry) this.away('machine');
          else this.setStep('press');
        }
        break;
      case 'press':
        if (this.reach(() => bar.buttonAt(), () => bar.startBrew(a), true)) this.setStep('brew');
        break;
      case 'brew':
        // Watching it pour, and a little dance when it's done.
        if (bar.brewOf(a) !== 'ready') break;
        if (this.cheer === undefined) {
          this.cheer = this.t;
          a.say(line('coffee'), 1.8);
        }
        c.setMood('cheer');
        if (this.t - this.cheer > 0.9) this.setStep('collect');
        break;
      case 'collect':
        if (this.reach(() => bar.mugAt(this.mug), () => {
          if (!bar.collectMug(this.mug, a)) return;
          this.hold('mug');
          this.brewed = true;
          this.fill = 1;
        })) this.away('machine');
        break;
      case 'drink':
        this.drink(dt);
        break;
      case 'eat':
        this.eat(dt);
        break;
      case 'queue':
        this.waited += dt;
        if (this.area.claim(this.waitFor, a)) this.walkTo(this.area.stand(this.waitFor), this.waitFor);
        // Fed up with waiting, it does without (but a mug it has goes back).
        else if (this.waited > PATIENCE && !(this.waitFor === 'counter' && this.carry)) {
          this.had.coffee = true;
          if (this.waitFor === 'counter') this.had.fruit = true;
          this.next();
        }
        break;
      case 'linger':
        this.stay ??= this.area.company(this) ? rand(5, 9) : rand(1.5, 3);
        if (this.t > this.stay) this.setStep('done');
        break;
    }
    return this.step === 'done';
  }

  /** Done at the counter or the machine: someone else can have it. */
  away(what) {
    this.area.free(what, this.agent);
    this.next();
  }

  /** A fruit, if there's one left, while it's at the counter anyway; else the counter's done with. */
  takeFruit() {
    if (!this.had.fruit && (this.fruit = this.bar.takeFruit(this.agent)) >= 0) {
      this.size = 1;
      this.setStep('takeFruit');
      return;
    }
    this.had.fruit = true;
    this.away('counter');
  }

  /**
   * Its cup hand over the counter to `at()` (world: the middle of what it's
   * after, or of where what it has goes; `bare`, where the hand itself goes)
   * and back. `touch` runs as it gets there; true once the hand's back.
   */
  reach(at, touch, bare = false) {
    const c = this.agent.character;
    this.target ??= at();
    if (this.t < REACH.out) {
      c.root.updateMatrixWorld();
      c.grab = c.root.worldToLocal((c.grab || new THREE.Vector3()).copy(this.target));
      if (!bare) c.grab.sub(c.cupOffset);
    } else {
      c.grab = null;
    }
    if (!this.touched && this.t >= REACH.touch) {
      this.touched = true;
      touch();
    }
    return this.t >= REACH.back;
  }

  /** A few sips, with a pause (and a chat) between them. */
  drink(dt) {
    const c = this.agent.character;
    if (this.sips === undefined) {
      this.sips = { done: 0, of: 3, t: -rand(0.6, 1.4) };
    }
    const s = this.sips;
    s.t += dt;
    c.sip = Math.max(0, lifted(s.t, SIP));
    if (s.t > SIP.up && s.t < SIP.up + SIP.hold) this.fill -= dt / SIP.hold / s.of;
    if (s.t >= SIP.up + SIP.hold + SIP.down) {
      s.done++;
      this.fill = 1 - s.done / s.of;
      s.t = -rand(2, 3.5);
      c.sip = 0;
    }
    this.bar.fillMug(this.mug, this.fill);
    if (s.done >= s.of) {
      this.had.coffee = true;
      this.next();
    }
  }

  /** A few bites, chewing each one. */
  eat(dt) {
    const c = this.agent.character;
    if (this.bites === undefined) {
      this.bites = { done: 0, t: -rand(0.4, 1) };
      this.agent.say(line('fruit'), 1.6);
    }
    const b = this.bites;
    b.t += dt;
    c.sip = Math.max(0, lifted(b.t, BITE));
    c.chew = b.t > BITE.up && b.t < BITE.up + BITE.hold;
    if (c.chew) this.size = Math.max(0, 1 - (b.done + (b.t - BITE.up) / BITE.hold) / BITES);
    if (b.t < BITE.up + BITE.hold + BITE.down) return;
    b.done++;
    b.t = -rand(0.8, 1.6);
    if (b.done < BITES) return;
    this.bar.ateFruit(this.fruit);
    this.hold(null);
    this.fruit = -1;
    this.had.fruit = true;
    c.sip = 0;
    this.next();
  }

  /** What's in its hand, in its hand: after its character has moved this frame. */
  place() {
    if (!this.carry) return;
    const c = this.agent.character;
    c.cupWorld(tmp);
    if (this.carry === 'mug') this.bar.holdMug(this.mug, tmp, c.root.rotation.y, THREE.MathUtils.smoothstep(c.sip, 0.6, 1) * 0.6);
    else this.bar.holdFruit(this.fruit, tmp, this.size);
  }

  /** Over (or called off): everything back where it came from, its spot free, its hands empty. */
  release() {
    this.bar.release(this.agent);
    this.area.leave(this.agent, this.spot);
    this.carry = null;
    Object.assign(this.agent.character, { grab: null, carrying: false, chew: false, gesture: false, sip: 0 });
  }
}

/** How far up at its mouth, `t` seconds into a sip or a bite (`up`, `hold`, `down`), 0 to 1. */
function lifted(t, { up, hold, down }) {
  const ease = THREE.MathUtils.smootherstep;
  if (t < 0) return 0;
  if (t < up) return ease(t, 0, up);
  if (t < up + hold) return 1;
  return 1 - ease(t - up - hold, 0, down);
}
