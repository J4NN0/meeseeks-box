import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createMascot, mascotKind, agentColor } from '../characters/index.js';
import { dampAngle, elasticOut } from '../engine/motion.js';
import { STATUS_COLORS, STATUS_LABELS, STATUS_SITUATIONS, formatDuration, providerInfo, statusSince, visualStatus } from '../status.js';
import { line } from './lines.js';

const { damp } = THREE.MathUtils;
const WALK_SPEED = 1.7;
/** Walking to and from a meeting, it's a brisk walk: it's a long way round. */
const MEETING_SPEED = 2.1;
/** A sip of coffee at the meeting table, in seconds: reach for the mug, lift it, drink, put it down, let go. */
const SIP = { reach: 0.55, lift: 0.6, drink: 1.3, lower: 0.6, letGo: 0.45 };
const SIP_S = SIP.reach + SIP.lift + SIP.drink + SIP.lower + SIP.letGo;
/** Getting up: how long the chair takes to swivel round before it stands. */
const RISE_S = 0.6;

const tmp = new THREE.Vector3();
const HELPER_SPOTS = [new THREE.Vector3(-0.98, 0, 0.5), new THREE.Vector3(0.98, 0, 0.5), new THREE.Vector3(-0.98, 0, -0.15)];

/**
 * One agent session made flesh: spawns from the Meeseeks Box, walks to a
 * free desk, works (or panics) while the session runs, then poofs. One you
 * summoned by pressing the box waits beside it for its instruction first. Agents
 * moving between the garage and the universes in its car battery walk into
 * the battery or pop out of it instead (`entry: 'battery'`, `leave('down')`),
 * and an office built while you weren't looking starts with everyone
 * already at their desks (`instant`).
 *
 * Called to a meeting (`joinMeeting`), it gets up and walks through the
 * house to its place in the meeting room, keeping its desk; sent back
 * (`leaveMeeting`), it walks back and sits down at it again.
 */
export class Agent {
  constructor(session, world, { mode, onClick, now, instant = false, entry = 'box' }) {
    this.id = session.id;
    this.session = session;
    this.world = world;
    this.onClick = onClick;
    this.phase = 'arriving';
    this.phaseTime = 0;
    this.visualStatus = session.status;
    this.lastStatus = null;
    this.nextChatter = 8 + Math.random() * 12;
    this.bubbleTime = 0;
    this.helpers = [];
    // In a meeting, or on the way to one: its place there (see World.claimMeetingPlace).
    this.place = null;
    // Walking back from a meeting.
    this.returning = false;
    // Seconds until it goes to (or back from) a meeting it was called to.
    this.cue = 0;
    // Getting up from a chair ('rising'): the phase to walk off in, and the
    // chair it's going to.
    this.rising = null;
    // At the meeting table: how far into a sip of coffee it is (-1 when not
    // drinking), and how long until the next one.
    this.sipT = -1;
    this.nextSip = 0;
    this.speed = WALK_SPEED;
    this.spawnedAt = now;
    this.color = agentColor(session.provider, session.id);
    this.colorHex = `#${this.color.getHexString()}`;

    this.kind = mascotKind(mode, session);
    this.character = this.makeCharacter(this.kind);
    world.scene.add(this.character.root);

    this.desk = world.claimDesk(this);
    this.lounge = this.desk ? null : world.claimLounge(this);
    // What it sits on: its desk's chair, or one at the meeting table.
    this.chair = this.desk;
    this.target = this.desk ? this.desk.approachWorld() : this.lounge.position.clone();
    this.buildLabel();
    if (instant) {
      this.settle(now);
      return;
    }

    if (entry === 'battery') {
      // Promoted out of the universe in the battery: pops out of the box in
      // the car's engine bay and hops down beside the car.
      this.spawnPoint = world.battery.mouth.clone();
      this.emergeFrom = world.battery.core.clone();
      this.path = world.pathFromBattery(this.target);
      world.battery.zap();
      world.effects.poof(this.emergeFrom, { scale: 0.5, count: 10 });
      this.say(line(this.kind, 'up'), 2.4);
    } else {
      // Jitter the spawn spot so back-to-back arrivals don't overlap.
      this.spawnPoint = world.spawnPoint.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.3));
      this.path = world.pathTo(this.target);
      world.box.press();
      world.effects.poof(this.spawnPoint.clone().add(new THREE.Vector3(0, 0.1, 0)), { scale: 1.1 });
      this.say(line(this.kind, 'spawn'), 2.6);
    }
    this.character.root.position.copy(this.spawnPoint);
    this.character.root.scale.setScalar(0.01);
    this.character.setMood('cheer');
  }

  /** Straight into place, skipping the walk and the easing into the pose. */
  settle(now) {
    const c = this.character;
    const root = c.root;
    const status = this.computeStatus(now);
    this.visualStatus = status;
    this.lastStatus = status;
    if (this.desk) {
      this.desk.seat.add(root);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      c.setMode('sit');
      c.setMood(this.moodFor(status));
      this.desk.swivelTarget = status === 'waiting' ? Math.PI : 0;
      this.desk.swivel.rotation.y = this.desk.swivelTarget;
      this.setPhase('seated');
      this.syncHelpers(0, true);
    } else {
      this.world.scene.add(root);
      root.position.copy(this.lounge.position);
      root.rotation.set(0, this.lounge.rotation, 0);
      c.setMode('stand');
      c.setMood(status === 'waiting' ? 'cheer' : 'idle');
      this.setPhase('lounging');
    }
    this.chair = this.desk;
    this.returning = false;
    this.speed = WALK_SPEED;
    for (let i = 0; i < 15; i++) c.update(0.1, i * 0.1);
  }

  // -------------------------------------------------------------- meetings

  /** Free to answer a meeting call: at or on its way to its desk, or lounging. */
  get canJoin() {
    return !this.place && ['walking', 'turning', 'sitting', 'seated', 'lounging'].includes(this.phase);
  }

  /** In the meeting, or on its way there (not leaving for good). */
  get inMeeting() {
    if (this.phase === 'rising') return !!this.place && this.rising.after === 'convening';
    return !!this.place && ['convening', 'turning', 'sitting', 'meeting'].includes(this.phase);
  }

  /**
   * Off to the meeting room, to `place` (a chair or a spot to stand), or
   * straight there if `instant` (an office you aren't looking at). Its desk
   * stays its own, and its subagents stay there working.
   */
  joinMeeting(place, { instant = false } = {}) {
    const atDesk = this.desk && ['turning', 'sitting', 'seated'].includes(this.phase);
    this.place = place;
    this.returning = false;
    if (instant) {
      this.getUp();
      this.takePlace();
      return;
    }
    this.say(line(this.kind, 'meeting'), 2.4);
    const from = atDesk ? this.desk.approachWorld() : this.character.root.position.clone();
    const path = [...(atDesk ? [from] : []), ...this.world.route(from, place.at)];
    // Sitting at its desk, it gets up first ('turning' is still standing behind the chair).
    if (atDesk && this.phase !== 'turning') {
      this.rise(path, 'convening', place.chair);
      return;
    }
    this.getUp();
    this.path = path;
    this.chair = place.chair;
    this.speed = MEETING_SPEED;
    this.setPhase('convening');
  }

  /**
   * Gets up the way it sat down, backwards: its chair swivels round to face
   * out, then it stands up and walks `path` as `after`, to `next` (the chair
   * it's off to, if any).
   */
  rise(path, after, next) {
    this.path = path;
    this.rising = { after, next };
    this.chair.swivelTarget = Math.PI;
    this.putDownCup();
    this.setPhase('rising');
  }

  /** On its feet, the chair turning back behind it, and off. */
  stoodUp() {
    const { after, next } = this.rising;
    this.rising = null;
    this.getUp();
    // Leaving the meeting, its place there is free now.
    if (after === 'walking') {
      this.world.releaseMeetingPlace(this.place);
      this.place = null;
    }
    this.chair = next;
    this.speed = MEETING_SPEED;
    this.setPhase(after);
  }

  /** Straight into its place in the meeting, no walk. */
  takePlace() {
    const { place } = this;
    const c = this.character;
    const root = c.root;
    const status = this.computeStatus(Date.now());
    this.chair = place.chair;
    if (place.chair) {
      place.chair.seat.add(root);
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
      place.chair.swivelTarget = 0;
      place.chair.swivel.rotation.y = 0;
      this.sitAtTable();
      c.setMode('sit');
      c.setMood(this.moodFor(status));
    } else {
      this.world.scene.add(root);
      root.position.copy(place.at);
      root.rotation.set(0, place.yaw, 0);
      c.setMode('stand');
      c.setMood(status === 'waiting' ? 'cheer' : 'idle');
    }
    this.visualStatus = this.lastStatus = status;
    if (this.desk) this.desk.swivelTarget = 0;
    this.rising = null;
    this.setPhase('meeting');
    for (let i = 0; i < 15; i++) c.update(0.1, i * 0.1);
  }

  /** The meeting's over: back to its desk (or the lounge), or straight there if `instant`. */
  leaveMeeting({ instant = false } = {}) {
    if (!this.place) return;
    // Called off before it was even out of its desk chair: it stays put.
    if (this.phase === 'rising' && this.rising.after === 'convening') {
      this.world.releaseMeetingPlace(this.place);
      this.place = null;
      this.rising = null;
      if (instant) this.settle(Date.now());
      else this.setPhase('seated');
      return;
    }
    const chair = this.place.chair;
    const seated = chair && (this.phase === 'meeting' || this.phase === 'sitting');
    this.target = this.desk ? this.desk.approachWorld() : this.lounge.position.clone();
    this.returning = true;
    if (seated && !instant) {
      this.say(line(this.kind, 'release'), 2.2);
      this.rise([chair.approach.clone(), ...this.world.route(chair.approach, this.target)], 'walking', this.desk);
      return;
    }
    this.getUp();
    this.world.releaseMeetingPlace(this.place);
    this.place = null;
    this.chair = this.desk;
    if (instant) {
      this.settle(Date.now());
      return;
    }
    this.path = this.world.route(this.character.root.position.clone(), this.target);
    this.speed = MEETING_SPEED;
    this.setPhase('walking');
    this.say(line(this.kind, 'release'), 2.2);
  }

  /** Up out of whatever chair it's in, standing where it was. */
  getUp() {
    const root = this.character.root;
    if (root.parent !== this.world.scene) reparent(this.world.scene, root);
    if (this.desk) this.desk.swivelTarget = 0;
    const chair = this.chair;
    if (chair && chair !== this.desk) {
      chair.swivelTarget = 0;
      chair.slidePad(null);
      this.putDownCup();
      this.character.setTable(null);
    }
  }

  /**
   * Sat down at the meeting table: notepad and pen out (the pad pulled in
   * closer, for a mascot with short arms), coffee soon.
   */
  sitAtTable() {
    const { chair, character: c } = this;
    const { pad, cup } = chair.setting;
    const at = c.padSpot ? new THREE.Vector3(c.padSpot.x, pad.y, c.padSpot.z) : pad;
    chair.slidePad(at);
    c.setTable({ pad: at, padTurn: chair.padTurn, cup });
    this.sipT = -1;
    this.nextSip = 2 + Math.random() * 7;
  }

  /**
   * At the meeting table, now and then a sip of coffee (not while napping,
   * or waving at you): its hand brings the mug up to its mouth and back.
   */
  drink(dt, status) {
    const c = this.character;
    if (this.sipT < 0) {
      if (status !== 'waiting' && status !== 'sleeping') this.nextSip -= dt;
      if (this.nextSip > 0) {
        c.setMood(this.moodFor(status));
        return;
      }
      this.sipT = 0;
    }
    this.sipT += dt;
    c.setMood('sip');
    c.sip = sipLift(this.sipT);
    if (this.sipT > SIP_S) {
      this.putDownCup();
      this.nextSip = 8 + Math.random() * 14;
    }
  }

  /**
   * The mug in its hand while it drinks: leaving the table as the hand lifts
   * it, tipping up to drink. After the character's update, so it's this
   * frame's hand.
   */
  holdCup() {
    const c = this.character;
    const { smoothstep } = THREE.MathUtils;
    const held = smoothstep(c.sip, 0, 0.25);
    this.chair.holdCup(held > 0 ? c.cupWorld(tmp) : null, smoothstep(c.sip, 0.6, 1) * 0.6, held);
  }

  /** Its mug back on the table, if it was drinking. */
  putDownCup() {
    if (this.sipT < 0) return;
    this.sipT = -1;
    this.character.sip = 0;
    this.chair.holdCup(null);
  }

  makeCharacter(kind) {
    const c = createMascot(kind, { provider: this.session.provider, seed: this.session.id });
    c.tag(this.id);
    return c;
  }

  // ---------------------------------------------------------------- label

  buildLabel() {
    const el = document.createElement('div');
    el.className = 'agent-tag';
    el.dataset.provider = this.session.provider;
    el.style.setProperty('--agent', this.colorHex);
    el.innerHTML = `
      <div class="bubble" hidden></div>
      <button class="plate" type="button">
        <span class="dot"></span>
        <span class="who"></span>
        <span class="st"></span>
      </button>
      <div class="doing"></div>`;
    const plate = el.querySelector('.plate');
    plate.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClick?.(this);
    });
    plate.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick?.(this, { slap: true });
    });
    this.el = el;
    this.bubbleEl = el.querySelector('.bubble');
    this.whoEl = el.querySelector('.who');
    this.stEl = el.querySelector('.st');
    this.doingEl = el.querySelector('.doing');
    // CSS2DRenderer owns the wrapper's transform; the tag inside scales with distance.
    const wrapper = document.createElement('div');
    wrapper.append(el);
    this.label = new CSS2DObject(wrapper);
    this.label.center.set(0.5, 1);
    this.character.root.add(this.label);
    this.labelY = this.character.headHeight + 0.2;
    this.renderLabel(Date.now());
  }

  /** Runs every frame, so it only touches the DOM when something changed. */
  renderLabel(now) {
    const s = this.session;
    const p = providerInfo(s.provider);
    const status = this.visualStatus;
    if (this.el.dataset.status !== status) {
      this.el.dataset.status = status;
      this.el.style.setProperty('--status', STATUS_COLORS[status] || '#999');
    }
    const since = statusSince(s, status);
    const last = s.activity.findLast((a) => a.kind !== 'think') || s.activity.at(-1);
    setText(this.whoEl, s.project || p.name);
    setText(this.stEl, `${STATUS_LABELS[status] || status}${since ? ` · ${formatDuration(now - since)}` : ''}`);
    const doing = this.phase === 'departing' ? `🔋 off to the ${this.world.battery.inside}` : status === 'sleeping' ? 'zzz…' : status === 'leaving' ? '✨ poof!' : last ? `${last.icon || ''} ${last.text}` : s.title;
    setText(this.doingEl, doing);
    const title = `${p.name} · ${s.title}`;
    if (this.el.title !== title) this.el.title = title;
  }

  say(text, duration = 3.2) {
    if (!text) return;
    this.bubbleEl.textContent = text;
    this.bubbleEl.hidden = false;
    this.bubbleTime = duration;
    this.bubbleEl.classList.remove('pop');
    void this.bubbleEl.offsetWidth; // restart the pop animation
    this.bubbleEl.classList.add('pop');
  }

  // --------------------------------------------------------------- status

  computeStatus(now) {
    if (this.phase === 'leaving' || this.phase === 'gone') return 'leaving';
    return visualStatus(this.session, now);
  }

  moodFor(status) {
    if (status === 'working') {
      const last = this.session.activity[this.session.activity.length - 1];
      return last?.kind === 'think' ? 'think' : 'work';
    }
    return { stressed: 'stress', waiting: 'wait', sleeping: 'sleep' }[status] || 'idle';
  }

  update(session) {
    this.session = session;
  }

  /** Just out of the box you pressed, and you haven't said what it's for yet. */
  get awaiting() {
    return this.session.box?.state === 'new';
  }

  /**
   * `ended`: the session is over, poof. `down`: moving deeper into the
   * battery, so walk over and hop in. `up`: moving to an office upstairs.
   */
  leave(reason = 'ended') {
    if (this.phase === 'leaving' || this.phase === 'departing' || this.phase === 'gone') return;
    if (reason === 'down' && this.phase !== 'arriving') {
      this.depart();
      return;
    }
    this.prevPhase = this.phase;
    if (this.chair && this.chair !== this.desk) this.putDownCup();
    this.phase = 'leaving';
    this.phaseTime = 0;
    // Poofs right here, saying why: the session ended (or, out of the box,
    // never had a task), it's needed upstairs, or it was bumped down before
    // it even reached a desk.
    this.say(line(this.kind, reason !== 'ended' ? reason : this.awaiting ? 'skip' : 'done'), 1.6);
  }

  depart() {
    const root = this.character.root;
    // Back to the aisle behind the chairs first, not through the next chair.
    const away = this.place || this.returning;
    this.rising = null;
    const aisle = this.desk && !away ? this.desk.approachWorld() : root.getWorldPosition(new THREE.Vector3());
    this.getUp();
    this.chair = null;
    if (this.place) this.world.releaseMeetingPlace(this.place);
    this.place = null;
    this.returning = false;
    if (this.desk) {
      this.desk.agent = null;
      this.desk.swivelTarget = 0;
      this.desk.setStatus(null);
      this.desk.screen.lastKey = '';
      this.desk = null;
    }
    this.world.releaseLounge(this.lounge);
    this.lounge = null;
    for (const h of this.helpers) {
      this.world.effects.poof(h.root.getWorldPosition(new THREE.Vector3()), { scale: 0.5, count: 6 });
      h.character.dispose();
    }
    this.helpers = [];
    // From the house, back through it to the garage first.
    const start = away ? this.world.route(aisle, this.world.way[0]) : [aisle];
    this.path = [...start, ...this.world.pathToBattery(start.at(-1))];
    this.speed = WALK_SPEED;
    this.sink = 0;
    this.setPhase('departing');
    this.say(line(this.kind, 'down'), 2.4);
  }

  setMascot(mode) {
    const kind = mascotKind(mode, this.session);
    if (kind === this.kind || this.phase === 'leaving' || this.phase === 'gone') return;
    const old = this.character;
    const next = this.makeCharacter(kind);
    old.root.parent.add(next.root);
    next.root.position.copy(old.root.position);
    next.root.rotation.copy(old.root.rotation);
    next.root.scale.copy(old.root.scale);
    next.setMode(old.mode);
    next.setMood(old.mood);
    this.label.removeFromParent();
    next.root.add(this.label);
    const pos = old.root.getWorldPosition(new THREE.Vector3());
    // A mug it was drinking from goes back down: the new one sits down afresh.
    if (old.table) this.putDownCup();
    old.dispose();
    this.character = next;
    this.kind = kind;
    if (old.table) this.sitAtTable();
    this.world.effects.poof(pos, { scale: 0.8, count: 10 });
    for (const h of this.helpers) this.world.effects.poof(h.root.getWorldPosition(new THREE.Vector3()), { scale: 0.5, count: 6 });
    this.syncHelpers(0, true);
  }

  // ------------------------------------------------------------ per frame

  /** A desk freed up: walk over from the lounge. */
  moveToDesk(desk) {
    this.world.releaseLounge(this.lounge);
    this.lounge = null;
    desk.agent = this;
    this.desk = desk;
    this.chair = desk;
    this.target = desk.approachWorld();
    const p = this.character.root.position;
    this.path = [new THREE.Vector3(p.x, 0, 2.95), new THREE.Vector3(0, 0, 2.95), new THREE.Vector3(0, 0, this.target.z), this.target.clone()];
    this.setPhase('walking');
  }

  tick(dt, t, now, camera) {
    this.phaseTime += dt;
    const c = this.character;
    const root = c.root;
    const status = this.computeStatus(now);
    if (status !== this.visualStatus || this.lastStatus === null) {
      const prev = this.visualStatus;
      this.visualStatus = status;
      if (this.phase === 'seated' || this.phase === 'lounging' || this.phase === 'meeting') this.onStatusChange(prev, status);
    }
    this.lastStatus = status;

    switch (this.phase) {
      case 'arriving': {
        const k = Math.min(1, this.phaseTime / 0.5);
        root.scale.setScalar(elasticOut(k));
        if (this.emergeFrom) hop(root.position, this.emergeFrom, this.spawnPoint, k);
        c.setMode('stand');
        c.setMood(this.phaseTime > 1.25 ? 'wait' : 'cheer');
        root.rotation.y = damp(root.rotation.y, 0, 6, dt);
        if (this.phaseTime > 1.25 && !this.awaiting) {
          if (this.session.box) this.say(line(this.kind, 'task'), 2.2);
          this.setPhase('walking');
        }
        break;
      }
      case 'walking': {
        c.setMode('walk');
        if (this.walkPath(dt)) {
          this.returning = false;
          this.speed = WALK_SPEED;
          this.setPhase(this.desk ? 'turning' : 'lounging');
          break;
        }
        if (this.desk && this.path.length <= 1) this.desk.swivelTarget = Math.PI;
        break;
      }
      case 'rising': {
        // Still sitting while the chair swivels round, then up.
        c.setMode('sit');
        c.setMood('idle');
        if (this.phaseTime > RISE_S) this.stoodUp();
        break;
      }
      case 'convening': {
        c.setMode('walk');
        const chair = this.place.chair;
        if (this.walkPath(dt)) {
          this.speed = WALK_SPEED;
          this.setPhase(chair ? 'turning' : 'meeting');
          break;
        }
        // Its chair swivels round to meet it, as at a desk.
        if (chair && this.path.length <= 1) chair.swivelTarget = Math.PI;
        break;
      }
      case 'departing': {
        if (!this.walkPath(dt)) {
          c.setMode('walk');
          break;
        }
        // Beside the car: hop up into the box in the engine bay, shrinking.
        c.setMode('stand');
        c.setMood('cheer');
        if (this.sink === 0) this.sinkFrom = root.position.clone();
        this.sink += dt;
        const k = Math.min(1, this.sink / 0.45);
        hop(root.position, this.sinkFrom, this.world.battery.core, k);
        root.scale.setScalar(Math.max(0.02, (1 - k) ** 1.5));
        if (k >= 1) {
          this.world.battery.zap();
          this.world.effects.poof(this.world.battery.core, { scale: 0.45, count: 8 });
          this.destroy();
        }
        break;
      }
      case 'turning': {
        // Back to the chair, then sit down in it.
        c.setMode('stand');
        c.setMood('idle');
        root.rotation.y = dampAngle(root.rotation.y, this.chair.backYaw, 10, dt);
        if (this.phaseTime > 0.45) {
          reparent(this.chair.seat, root);
          if (this.place) this.sitAtTable();
          this.setPhase('sitting');
        }
        break;
      }
      case 'sitting': {
        c.setMode('sit');
        root.position.x = damp(root.position.x, 0, 8, dt);
        root.position.y = damp(root.position.y, 0, 8, dt);
        root.position.z = damp(root.position.z, 0, 8, dt);
        root.rotation.y = dampAngle(root.rotation.y, 0, 8, dt);
        if (this.phaseTime > 0.7) {
          root.position.set(0, 0, 0);
          this.setPhase(this.place ? 'meeting' : 'seated');
          this.onStatusChange(null, status);
        }
        break;
      }
      case 'seated': {
        c.setMode('sit');
        c.setMood(this.moodFor(status));
        this.desk.swivelTarget = status === 'waiting' ? Math.PI : Math.sin(t * 0.4 + this.desk.index) * 0.06;
        break;
      }
      case 'lounging': {
        c.setMode('stand');
        c.setMood(status === 'waiting' ? 'cheer' : 'idle');
        root.rotation.y = dampAngle(root.rotation.y, this.lounge.rotation, 5, dt);
        break;
      }
      case 'meeting': {
        // At the table it takes notes and drinks its coffee (or waves at
        // you, or naps); standing, it waits like in the lounge.
        const chair = this.place.chair;
        if (chair) {
          c.setMode('sit');
          chair.swivelTarget = 0;
          this.drink(dt, status);
        } else {
          c.setMode('stand');
          c.setMood(status === 'waiting' ? 'cheer' : 'idle');
          root.rotation.y = dampAngle(root.rotation.y, this.place.yaw, 5, dt);
        }
        break;
      }
      case 'leaving': {
        c.setMood('cheer');
        if (this.phaseTime > 1.3 && !this.poofed) {
          this.poofed = true;
          this.world.effects.poof(root.getWorldPosition(new THREE.Vector3()), { scale: 1.2, count: 16 });
          for (const h of this.helpers) this.world.effects.poof(h.root.getWorldPosition(new THREE.Vector3()), { scale: 0.6, count: 8 });
        }
        if (this.poofed) {
          root.scale.setScalar(Math.max(0.001, root.scale.x - dt * 8));
          for (const h of this.helpers) h.root.scale.setScalar(Math.max(0.001, h.root.scale.x - dt * 8));
        }
        if (this.phaseTime > 1.6) this.destroy();
        break;
      }
    }

    // Keep the label above the head, whether standing or sitting.
    const targetY = (c.mode === 'sit' ? c.seatedHeadHeight : c.headHeight) + 0.18;
    this.labelY = damp(this.labelY, targetY, 6, dt);
    this.label.position.set(0, this.labelY, 0);
    if (camera) {
      const dist = camera.position.distanceTo(root.getWorldPosition(tmp));
      const scale = THREE.MathUtils.clamp(18 / dist, 0.78, 1.15);
      if (Math.abs(scale - (this.labelScale || 0)) > 0.01) {
        this.labelScale = scale;
        this.el.style.setProperty('--s', scale.toFixed(2));
      }
    }

    if (this.bubbleTime > 0) {
      this.bubbleTime -= dt;
      c.talking = this.bubbleTime > 0.3;
      if (this.bubbleTime <= 0) this.bubbleEl.hidden = true;
    } else {
      c.talking = false;
    }

    if (this.phase === 'seated' || this.phase === 'lounging' || this.phase === 'meeting') {
      this.nextChatter -= dt;
      if (this.nextChatter <= 0) {
        this.nextChatter = 18 + Math.random() * 30;
        const situation = STATUS_SITUATIONS[status];
        if (situation) this.say(line(this.kind, this.moodFor(status) === 'think' ? 'think' : situation));
      }
      this.syncHelpers(dt);
    }

    c.update(dt, t);
    if (this.sipT >= 0) this.holdCup();
    for (const h of this.helpers) {
      h.character.setMood(h.mood);
      h.character.update(dt, t);
    }

    if (this.desk && this.phase !== 'gone') {
      // Off in a meeting, its desk carries on showing what the session's doing.
      const live = this.phase === 'seated' || this.phase === 'leaving' || this.inMeeting;
      const deskStatus = live ? status : null;
      this.desk.setStatus(deskStatus, deskStatus ? STATUS_COLORS[deskStatus] : null);
      if (live) this.desk.screen.draw(this.session, status, now, t);
    }
    this.renderLabel(now);
  }

  onStatusChange(prev, status) {
    const situation = STATUS_SITUATIONS[status];
    if (situation && prev !== null) this.say(line(this.kind, situation));
    this.nextChatter = 15 + Math.random() * 20;
  }

  /**
   * Subagents appear as mini versions of the mascot standing by the desk,
   * and carry on there while it's in a meeting.
   */
  syncHelpers(dt, rebuild = false) {
    if (!this.desk) return;
    const want = this.phase === 'seated' || this.inMeeting ? Math.min(HELPER_SPOTS.length, this.session.helpers || 0) : 0;
    if (rebuild) {
      for (const h of this.helpers) h.character.dispose();
      this.helpers = [];
    }
    while (this.helpers.length < want) {
      const i = this.helpers.length;
      const character = createMascot(this.kind, { provider: this.session.provider, seed: `${this.session.id}:helper:${i}` });
      character.tag(this.id);
      character.root.scale.setScalar(0.72);
      character.root.position.copy(HELPER_SPOTS[i]);
      character.root.rotation.y = i === 2 ? Math.PI / 2 : Math.PI + (i === 0 ? 0.5 : -0.5);
      this.desk.root.add(character.root);
      this.helpers.push({ character, root: character.root, mood: i % 2 ? 'cheer' : 'idle' });
      if (!rebuild) this.world.effects.poof(character.root.getWorldPosition(new THREE.Vector3()), { scale: 0.6, count: 8 });
      if (i === 0 && !rebuild) this.say(line(this.kind, 'helper'), 2.2);
    }
    while (this.helpers.length > want) {
      const h = this.helpers.pop();
      this.world.effects.poof(h.root.getWorldPosition(new THREE.Vector3()), { scale: 0.6, count: 8 });
      h.character.dispose();
    }
    if (dt) {
      for (const h of this.helpers) if (Math.random() < dt * 0.15) h.mood = h.mood === 'cheer' ? 'idle' : 'cheer';
    }
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** Walks along `path`; true once at the end of it. */
  walkPath(dt) {
    const root = this.character.root;
    const next = this.path[0];
    if (!next) return true;
    const d = next.clone().sub(root.position);
    d.y = 0;
    const dist = d.length();
    if (dist < 0.05) {
      this.path.shift();
    } else {
      root.position.addScaledVector(d.normalize(), Math.min(dist, this.speed * dt));
      root.rotation.y = dampAngle(root.rotation.y, Math.atan2(d.x, d.z), 10, dt);
    }
    return false;
  }

  // ---------------------------------------------------------------- slaps

  /** The mascot (this agent's, or one of its helpers') that `object` is part of. */
  characterOf(object) {
    for (let o = object; o; o = o.parent) {
      if (o === this.character.root) return this.character;
      const helper = this.helpers.find((h) => h.root === o);
      if (helper) return helper.character;
    }
    return this.character;
  }

  /**
   * Right-clicked: your arm reaches in from the bottom right of the screen
   * and slaps `who`. Just for fun: the session, the status and the desk don't change.
   */
  slap(camera, who = this.character) {
    if (this.phase === 'gone' || !who.face) return;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    this.world.effects.slap({
      camera,
      face: who.face,
      radius: who.faceRadius,
      right,
      words: who.slapWords,
      sparks: who.slapSparks,
      onHit: (push) => this.slapped(who, push, camera.position),
    });
  }

  slapped(who, push, eye) {
    // Gone (or swapped for another mascot) while the hand was on its way.
    if (this.phase === 'gone' || !who.root.parent) return;
    const face = who.face.getWorldPosition(new THREE.Vector3());
    const toward = eye.clone().sub(face).setY(0);
    if (toward.lengthSq() < 1e-6) toward.copy(push).negate();
    toward.normalize();
    // Into the mascot's own frame, where its joints turn.
    const q = who.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    who.slap(push.applyQuaternion(q), toward.applyQuaternion(q));

    const now = performance.now();
    this.slapStreak = now - (this.lastSlapAt ?? -Infinity) < 4000 ? (this.slapStreak || 0) + 1 : 1;
    this.lastSlapAt = now;
    const status = this.visualStatus;
    const situation = who !== this.character ? 'slapHelper'
      : this.slapStreak >= 3 ? 'slapAgain'
      : status === 'sleeping' ? 'slapSleep'
      : status === 'waiting' ? 'slapWait'
      : 'slap';
    this.say(line(this.kind, situation), 2.2);
    this.nextChatter = Math.max(this.nextChatter, 12);
  }

  setHighlight(on) {
    this.character.setHighlight(on);
    this.el.classList.toggle('hover', on);
  }

  destroy() {
    this.phase = 'gone';
    this.label.removeFromParent();
    this.label.element.remove();
    for (const h of this.helpers) h.character.dispose();
    this.helpers = [];
    if (this.chair && this.chair !== this.desk) {
      this.putDownCup();
      this.chair.swivelTarget = 0;
    }
    this.world.releaseMeetingPlace(this.place);
    this.place = null;
    this.character.dispose();
    if (this.desk) {
      this.desk.agent = null;
      this.desk.swivelTarget = 0;
      this.desk.setStatus(null);
      this.desk.screen.lastKey = '';
    }
    this.world.releaseLounge(this.lounge);
  }

  /** World-space anchor for camera focus: the monitor (or the agent). */
  focusPoints() {
    const atTable = this.place && (['turning', 'sitting', 'meeting'].includes(this.phase)
      || (this.phase === 'rising' && this.rising.after === 'walking'));
    if (atTable) {
      // In a meeting: from across the table, looking a little to its left
      // (the screen's right) so the side panel doesn't cover it.
      const p = this.character.root.getWorldPosition(new THREE.Vector3());
      const ahead = new THREE.Vector3(Math.sin(this.place.yaw), 0, Math.cos(this.place.yaw));
      const left = new THREE.Vector3(ahead.z, 0, -ahead.x);
      return {
        eye: p.clone().addScaledVector(ahead, 4.1).addScaledVector(left, 1.4).setY(4.1),
        look: p.clone().addScaledVector(left, 0.75).setY(1.0),
      };
    }
    // On its way to the meeting, it's off somewhere between the two; just
    // out of the box, it's still beside it.
    if (this.desk && this.phase !== 'convening' && this.phase !== 'arriving') {
      // Over the shoulder and a bit high, so the head doesn't hide the screen.
      // Looking slightly right of the monitor keeps it clear of the side panel.
      const look = this.desk.root.localToWorld(new THREE.Vector3(0.55, 1.15, -0.2));
      const eye = this.desk.root.localToWorld(new THREE.Vector3(1.35, 2.75, 2.75));
      return { eye, look };
    }
    const p = this.character.root.getWorldPosition(new THREE.Vector3());
    // Out of the box, from in front and above it, the box in view and the
    // side panel clear of them both.
    if (this.phase === 'arriving') return { eye: p.clone().add(new THREE.Vector3(1.2, 2.9, 6.2)), look: p.clone().add(new THREE.Vector3(0.9, 1.25, 0.3)) };
    return { eye: p.clone().add(new THREE.Vector3(1.5, 2.2, 3)), look: p.clone().add(new THREE.Vector3(0, 1, 0)) };
  }
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

/** Along a little arc from `a` to `b` (k from 0 to 1). */
function hop(out, a, b, k) {
  out.lerpVectors(a, b, k);
  out.y += Math.sin(k * Math.PI) * 0.45;
}

/** How far the mug is lifted, 0 to 1, `t` seconds into a sip. */
function sipLift(t) {
  const ease = THREE.MathUtils.smootherstep;
  let a = t - SIP.reach;
  if (a < 0) return 0;
  if (a < SIP.lift) return ease(a, 0, SIP.lift);
  a -= SIP.lift + SIP.drink;
  if (a < 0) return 1;
  if (a < SIP.lower) return 1 - ease(a, 0, SIP.lower);
  return 0;
}

const _turn = new THREE.Euler();

/**
 * Moves the mascot under `parent`, keeping where it is in the room, as a
 * plain turn about y. attach() alone can come out with a half turn as a flip
 * about x and z instead, and walking and sitting, which only turn y, would
 * then face it the wrong way round.
 */
function reparent(parent, root) {
  parent.attach(root);
  root.rotation.set(0, _turn.setFromQuaternion(root.quaternion, 'YXZ').y, 0);
}
