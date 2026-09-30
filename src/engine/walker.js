import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// First-person walking: pointer-lock mouse look, WASD/arrows to move,
// Shift to run, Space to jump. Collides with the room's furniture footprints
// (boxes and circles on the floor plane) and stays on the slab.

const EYE_HEIGHT = 1.62;
const RADIUS = 0.28;
const WALK_SPEED = 2.6;
const RUN_SPEED = 4.8;
const GRAVITY = 16;
const JUMP_SPEED = 4.6;
// After you leave pointer lock with Esc, browsers refuse to re-lock for about
// a second (so a page can't trap your cursor). Chrome's window is ~1s.
const RELOCK_COOLDOWN_MS = 1200;

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
};

const { damp } = THREE.MathUtils;
const fwd = new THREE.Vector3();
const side = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Walker extends THREE.EventDispatcher {
  constructor(camera, domElement, { colliders, bounds, portal }) {
    super();
    this.camera = camera;
    this.colliders = colliders;
    this.bounds = bounds;
    this.portal = portal;
    this.look = new PointerLockControls(camera, domElement);
    this.look.pointerSpeed = 0.9;
    this.look.minPolarAngle = 0.15;
    this.look.maxPolarAngle = Math.PI - 0.15;
    this.domElement = domElement;
    this.unlockedAt = -Infinity;
    this.selfUnlock = false;
    this.relockTimer = 0;
    this.look.addEventListener('lock', () => this.dispatchEvent({ type: 'lock' }));
    this.look.addEventListener('unlock', () => {
      // Only a user exit (Esc) triggers the cooldown; our own unlocks don't.
      if (!this.selfUnlock) this.unlockedAt = performance.now();
      this.selfUnlock = false;
      this.dispatchEvent({ type: 'unlock' });
    });
    this.active = false;
    this.pressed = new Set();
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.height = 0; // feet above the floor while jumping
    this.vy = 0;
    this.bob = 0;
    this.portalCooldown = 0;

    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      this.pressed.add(e.code);
      if (KEYS.jump.includes(e.code)) {
        e.preventDefault();
        if (this.height <= 0.001) this.vy = JUMP_SPEED;
      }
    });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    window.addEventListener('blur', () => this.pressed.clear());
    this.look.addEventListener('unlock', () => this.pressed.clear());
  }

  // Ask the document: PointerLockControls fires lock/unlock before it updates
  // its own isLocked flag, so that flag is stale inside those events.
  get locked() { return this.domElement.ownerDocument.pointerLockElement === this.domElement; }

  /** True while a click is waiting out the re-lock cooldown. */
  get resuming() { return this.relockTimer !== 0; }

  /**
   * Captures the mouse. Call from a click or key press. Inside the post-Esc
   * cooldown, the request is deferred until it can succeed; the click's user
   * activation is still valid by then.
   */
  lock() {
    if (this.locked || this.relockTimer) return;
    const wait = this.unlockedAt + RELOCK_COOLDOWN_MS - performance.now();
    if (wait > 0) {
      this.relockTimer = setTimeout(() => {
        this.relockTimer = 0;
        this.request();
      }, wait);
      this.dispatchEvent({ type: 'resuming' });
      return;
    }
    this.request();
  }

  request() {
    try {
      const pending = this.domElement.requestPointerLock();
      // Older browsers return nothing; newer ones return a promise.
      pending?.catch?.(() => this.dispatchEvent({ type: 'lockfailed' }));
    } catch {
      this.dispatchEvent({ type: 'lockfailed' });
    }
  }

  unlock() {
    clearTimeout(this.relockTimer);
    this.relockTimer = 0;
    if (!this.locked) return;
    this.selfUnlock = true;
    this.look.unlock();
  }

  /** Starts walking from the camera's current spot (after the fly-in). */
  start(position) {
    this.active = true;
    this.position.set(position.x, 0, position.z);
    this.velocity.set(0, 0, 0);
    this.height = 0;
    this.vy = 0;
  }

  stop() {
    this.active = false;
    this.unlock();
  }

  held(action) {
    return KEYS[action].some((k) => this.pressed.has(k));
  }

  update(dt) {
    if (!this.active) return;
    const cam = this.camera;

    // Desired horizontal velocity from input, relative to where we look.
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    side.crossVectors(fwd, UP).normalize();
    const ix = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    const iz = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
    const wish = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(side, ix);
    if (wish.lengthSq() > 1) wish.normalize();
    const speed = this.held('run') ? RUN_SPEED : WALK_SPEED;
    this.velocity.x = damp(this.velocity.x, wish.x * speed, 10, dt);
    this.velocity.z = damp(this.velocity.z, wish.z * speed, 10, dt);

    this.position.addScaledVector(this.velocity, dt);
    this.collide();

    // Jumping.
    this.vy -= GRAVITY * dt;
    this.height = Math.max(0, this.height + this.vy * dt);
    if (this.height === 0) this.vy = Math.max(0, this.vy);

    // A little head bob sells the walking.
    const moving = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.height === 0 && moving > 0.3) this.bob += dt * moving * 2.4;
    else this.bob = damp(this.bob, Math.round(this.bob / Math.PI) * Math.PI, 6, dt);
    const bobY = Math.sin(this.bob * 2) * 0.035 * Math.min(1, moving / WALK_SPEED);

    cam.position.set(this.position.x, EYE_HEIGHT + this.height + bobY, this.position.z);

    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    const p = this.portal;
    if (p && this.portalCooldown === 0 && this.position.x < p.x + RADIUS + 0.12 && Math.abs(this.position.z - p.z) < p.radius * 0.7) {
      this.portalCooldown = 2;
      this.dispatchEvent({ type: 'portal' });
    }
  }

  /** Teleports, keeping the current look direction unless one is given. */
  teleport(x, z, lookAt) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.camera.position.set(x, EYE_HEIGHT, z);
    if (lookAt) this.camera.lookAt(lookAt);
  }

  collide() {
    const p = this.position;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (c.kind === 'circle') {
          const dx = p.x - c.x;
          const dz = p.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + RADIUS;
          if (d < min && d > 1e-6) {
            p.x = c.x + (dx / d) * min;
            p.z = c.z + (dz / d) * min;
          }
        } else {
          const cx = THREE.MathUtils.clamp(p.x, c.minX, c.maxX);
          const cz = THREE.MathUtils.clamp(p.z, c.minZ, c.maxZ);
          const dx = p.x - cx;
          const dz = p.z - cz;
          const d = Math.hypot(dx, dz);
          if (d >= RADIUS) continue;
          if (d > 1e-6) {
            p.x = cx + (dx / d) * RADIUS;
            p.z = cz + (dz / d) * RADIUS;
          } else {
            // Centre inside the box: leave by the nearest side.
            const exits = [[c.minX - RADIUS - p.x, 0], [c.maxX + RADIUS - p.x, 0], [0, c.minZ - RADIUS - p.z], [0, c.maxZ + RADIUS - p.z]];
            exits.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
            p.x += exits[0][0];
            p.z += exits[0][1];
          }
        }
      }
    }
    const b = this.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX + RADIUS, b.maxX - RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ + RADIUS, b.maxZ - RADIUS);
  }
}

export { EYE_HEIGHT };
