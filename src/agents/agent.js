import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createMascot, mascotKind, agentColor } from '../characters/index.js';
import { STATUS_COLORS, STATUS_LABELS, STATUS_SITUATIONS, formatDuration, providerInfo, statusSince } from '../status.js';
import { CONFIG } from '../config.js';
import { line } from './lines.js';

const { damp } = THREE.MathUtils;
const WALK_SPEED = 1.7;

const tmp = new THREE.Vector3();
const HELPER_SPOTS = [new THREE.Vector3(-0.98, 0, 0.5), new THREE.Vector3(0.98, 0, 0.5), new THREE.Vector3(-0.98, 0, -0.15)];

/**
 * One agent session made flesh: spawns from the Meeseeks Box, walks to a
 * free desk, works (or panics) while the session runs, then poofs.
 */
export class Agent {
  constructor(session, world, { mode, onClick, now }) {
    this.id = session.id;
    this.session = session;
    this.world = world;
    this.onClick = onClick;
    this.phase = 'arriving';
    this.phaseTime = 0;
    this.visualStatus = session.status;
    this.lastStatus = null;
    this.missingSince = 0;
    this.nextChatter = 8 + Math.random() * 12;
    this.bubbleTime = 0;
    this.helpers = [];
    this.spawnedAt = now;
    this.color = agentColor(session.provider, session.id);
    this.colorHex = `#${this.color.getHexString()}`;

    this.kind = mascotKind(mode, session.provider, session.id);
    this.character = this.makeCharacter(this.kind);
    world.scene.add(this.character.root);
    // Jitter the spawn spot so back-to-back arrivals don't overlap.
    this.spawnPoint = world.spawnPoint.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.3));
    this.character.root.position.copy(this.spawnPoint);
    this.character.root.scale.setScalar(0.01);
    this.character.setMood('cheer');

    this.desk = world.claimDesk(this);
    this.lounge = this.desk ? null : world.claimLounge(this);
    this.target = this.desk ? this.desk.approachWorld() : this.lounge.position.clone();
    this.path = world.pathTo(this.target);

    this.buildLabel();
    world.box.press();
    world.effects.poof(this.spawnPoint.clone().add(new THREE.Vector3(0, 0.1, 0)), { scale: 1.1 });
    this.say(line(this.kind, 'spawn'), 2.6);
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
    el.querySelector('.plate').addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClick?.(this);
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
    setText(this.doingEl, status === 'sleeping' ? 'zzz…' : status === 'leaving' ? '✨ poof!' : last ? `${last.icon || ''} ${last.text}` : s.title);
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
    const s = this.session;
    if (s.status === 'working' && s.turnStartedAt && now - s.turnStartedAt > CONFIG.stressAfterMs) return 'stressed';
    return s.status;
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
    this.missingSince = 0;
  }

  leave() {
    if (this.phase === 'leaving' || this.phase === 'gone') return;
    this.prevPhase = this.phase;
    this.phase = 'leaving';
    this.phaseTime = 0;
    this.say(line(this.kind, 'done'), 1.6);
  }

  setMascot(mode) {
    const kind = mascotKind(mode, this.session.provider, this.session.id);
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
    old.dispose();
    this.character = next;
    this.kind = kind;
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
      if (this.phase === 'seated' || this.phase === 'lounging') this.onStatusChange(prev, status);
    }
    this.lastStatus = status;

    switch (this.phase) {
      case 'arriving': {
        const k = Math.min(1, this.phaseTime / 0.5);
        root.scale.setScalar(elasticOut(k));
        c.setMode('stand');
        c.setMood('cheer');
        root.rotation.y = damp(root.rotation.y, 0, 6, dt);
        if (this.phaseTime > 1.25) this.setPhase('walking');
        break;
      }
      case 'walking': {
        c.setMode('walk');
        const next = this.path[0];
        if (!next) {
          this.setPhase(this.desk ? 'turning' : 'lounging');
          break;
        }
        const d = next.clone().sub(root.position);
        d.y = 0;
        const dist = d.length();
        if (dist < 0.05) {
          this.path.shift();
        } else {
          root.position.addScaledVector(d.normalize(), Math.min(dist, WALK_SPEED * dt));
          root.rotation.y = dampAngle(root.rotation.y, Math.atan2(d.x, d.z), 10, dt);
        }
        if (this.desk && this.path.length <= 1) this.desk.swivelTarget = Math.PI;
        break;
      }
      case 'turning': {
        c.setMode('stand');
        c.setMood('idle');
        root.rotation.y = dampAngle(root.rotation.y, 0, 10, dt);
        if (this.phaseTime > 0.45) {
          this.desk.seat.attach(root);
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
          this.setPhase('seated');
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

    if (this.phase === 'seated' || this.phase === 'lounging') {
      this.nextChatter -= dt;
      if (this.nextChatter <= 0) {
        this.nextChatter = 18 + Math.random() * 30;
        const situation = STATUS_SITUATIONS[status];
        if (situation) this.say(line(this.kind, this.moodFor(status) === 'think' ? 'think' : situation));
      }
      this.syncHelpers(dt);
    }

    c.update(dt, t);
    for (const h of this.helpers) {
      h.character.setMood(h.mood);
      h.character.update(dt, t);
    }

    if (this.desk && this.phase !== 'gone') {
      const deskStatus = this.phase === 'seated' || this.phase === 'leaving' ? status : null;
      this.desk.setStatus(deskStatus, deskStatus ? STATUS_COLORS[deskStatus] : null);
      if (this.phase === 'seated' || this.phase === 'leaving') this.desk.screen.draw(this.session, status, now, t);
    }
    this.renderLabel(now);
  }

  onStatusChange(prev, status) {
    const situation = STATUS_SITUATIONS[status];
    if (situation && prev !== null) this.say(line(this.kind, situation));
    this.nextChatter = 15 + Math.random() * 20;
  }

  /** Subagents appear as mini versions of the mascot standing by the desk. */
  syncHelpers(dt, rebuild = false) {
    if (!this.desk) return;
    const want = this.phase === 'seated' ? Math.min(HELPER_SPOTS.length, this.session.helpers || 0) : 0;
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
    if (this.desk) {
      // Over the shoulder and a bit high, so the head doesn't hide the screen.
      // Looking slightly right of the monitor keeps it clear of the side panel.
      const look = this.desk.root.localToWorld(new THREE.Vector3(0.55, 1.15, -0.2));
      const eye = this.desk.root.localToWorld(new THREE.Vector3(1.35, 2.75, 2.75));
      return { eye, look };
    }
    const p = this.character.root.getWorldPosition(new THREE.Vector3());
    return { eye: p.clone().add(new THREE.Vector3(1.5, 2.2, 3)), look: p.clone().add(new THREE.Vector3(0, 1, 0)) };
  }
}

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function elasticOut(x) {
  if (x <= 0) return 0.01;
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}
