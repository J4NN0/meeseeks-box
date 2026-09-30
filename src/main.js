import '@fontsource/luckiest-guy';
import '@fontsource/patrick-hand';
import '@fontsource/permanent-marker';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { InkRenderer, enableInkLayers } from './engine/outline.js';
import { Walker, EYE_HEIGHT } from './engine/walker.js';
import { World } from './world/index.js';
import { ROOM, WALK_BOUNDS, PORTAL } from './world/room.js';
import { AgentManager } from './agents/manager.js';
import { Feed } from './data/feed.js';
import { Hud } from './ui/hud.js';
import { MASCOT_MODES } from './characters/index.js';
import { CONFIG } from './config.js';

const store = {
  get(key, fallback) {
    try { return localStorage.getItem(`meeseeks:${key}`) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`meeseeks:${key}`, value); } catch { /* private mode */ }
  },
};

// Renderer ------------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x000000, 0);
app.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
app.appendChild(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
enableInkLayers(camera);
const HOME = { eye: new THREE.Vector3(10.8, 12.4, 20.5), look: new THREE.Vector3(0.3, 0.2, 0.1) };
// Where you "stand" when you step into the room: just behind the box.
const WALK_START = { eye: new THREE.Vector3(0, EYE_HEIGHT, 5.6), look: new THREE.Vector3(0, 1.2, 0) };
const WALK_FOV = 70;
camera.position.copy(HOME.eye);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.look);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 34;
controls.maxPolarAngle = 1.42;
controls.minAzimuthAngle = -0.35;
controls.maxAzimuthAngle = 1.45;
controls.screenSpacePanning = true;
controls.update();

const ink = new InkRenderer(renderer, scene, camera);
ink.enabled = CONFIG.ink;

// World ---------------------------------------------------------------------
const world = new World(scene);
const feed = new Feed();
let mode = CONFIG.mascots || store.get('mascots', 'meeseeks');
if (!MASCOT_MODES[mode]) mode = 'meeseeks';
const bootAt = performance.now();

const walker = new Walker(camera, renderer.domElement, { colliders: world.colliders, bounds: WALK_BOUNDS, portal: PORTAL });
let view = 'orbit'; // orbit | walk

const hud = new Hud({
  mode,
  onModeChange(m) {
    mode = m;
    store.set('mascots', m);
    manager.setMode(m);
  },
  onWalk: () => (view === 'walk' ? walker.lock() : enterWalk()),
  onReset: () => (view === 'walk' ? exitWalk() : unfocus()),
  onClosePanel: () => unfocus(),
});

const manager = new AgentManager(world, {
  onEvent(type, agent) {
    // Don't greet every pre-existing session with a toast on page load.
    if (type === 'spawn' && performance.now() - bootAt < 8000) return;
    hud.announce(type, agent);
  },
  onClick: (agent) => focusAgent(agent),
});
manager.mode = mode;

feed.onChange((sessions) => manager.sync(sessions, Date.now()));
feed.start();

// Camera moves -----------------------------------------------------------------
let flight = null;
let focused = null;
const lookTmp = new THREE.Vector3();

function currentLook() {
  if (view === 'orbit') return controls.target.clone();
  return camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(5));
}

function flyTo(eye, look, { duration = 1.1, onDone } = {}) {
  flight = { fromEye: camera.position.clone(), fromLook: currentLook(), eye, look, t: 0, duration, onDone };
}

function updateFlight(dt) {
  if (!flight) return;
  const f = flight;
  f.t = Math.min(1, f.t + dt / f.duration);
  const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
  camera.position.lerpVectors(f.fromEye, f.eye, k);
  lookTmp.lerpVectors(f.fromLook, f.look, k);
  if (view === 'orbit') controls.target.copy(lookTmp);
  else camera.lookAt(lookTmp);
  if (f.t >= 1) {
    flight = null;
    f.onDone?.();
  }
}

function focusAgent(agent) {
  focused = agent;
  hud.showPanel(agent);
  if (view === 'walk') {
    // You're already standing there; just free the mouse for the panel.
    walker.unlock();
    syncWalkHud();
    return;
  }
  const { eye, look } = agent.focusPoints();
  flyTo(eye, look);
}

function unfocus() {
  focused = null;
  hud.hidePanel();
  if (view === 'walk') {
    walker.lock();
    syncWalkHud();
  } else {
    flyTo(HOME.eye.clone(), HOME.look.clone());
  }
}

// First person -----------------------------------------------------------------
function enterWalk() {
  if (view === 'walk') return;
  focused = null;
  hud.hidePanel();
  view = 'walk';
  controls.enabled = false;
  // Pointer lock must be requested from the click itself, so lock now and fly in.
  walker.lock();
  flyTo(WALK_START.eye.clone(), WALK_START.look.clone(), {
    duration: 1.4,
    onDone: () => {
      // Close the room up only once we're inside, so we don't fly through a wall.
      world.room.setEnclosed(true);
      walker.start(camera.position);
      syncWalkHud();
    },
  });
  syncWalkHud();
}

function exitWalk() {
  if (view !== 'walk') return;
  const look = currentLook();
  walker.stop();
  world.room.setEnclosed(false);
  view = 'orbit';
  controls.enabled = true;
  controls.target.copy(look);
  focused = null;
  hud.hidePanel();
  flyTo(HOME.eye.clone(), HOME.look.clone(), { duration: 1.4 });
  syncWalkHud();
}

function syncWalkHud() {
  hud.setWalk({ active: view === 'walk', locked: walker.locked, flying: !!flight, resuming: walker.resuming });
}

walker.addEventListener('lock', () => {
  if (focused) { focused = null; hud.hidePanel(); }
  syncWalkHud();
});
walker.addEventListener('unlock', syncWalkHud);
walker.addEventListener('portal', () => {
  // Wubba lubba dub dub: step through Rick's portal, come out by the car.
  const flash = document.getElementById('portal-flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');
  walker.teleport(7.2, -1.2, new THREE.Vector3(-2, 1.3, 0.5));
  hud.toast('🌀 Wubba lubba dub dub!');
});
walker.addEventListener('resuming', syncWalkHud);
// A refused lock just leaves you paused; the next click tries again.
walker.addEventListener('lockfailed', syncWalkHud);

// Picking -----------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
const pointer = new THREE.Vector2();
const CENTER = new THREE.Vector2(0, 0);
let hovered = null;
let aimed = null;
let aimFrame = 0;
let downAt = null;

/** Agent under a screen point: the mascot itself, its helpers, or its desk. */
function agentAt(ndc, maxDistance = Infinity) {
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = maxDistance;
  for (const hit of raycaster.intersectObjects(scene.children, true)) {
    const d = hit.object.userData;
    if (d.agentId) return manager.byId(d.agentId) || null;
    if (d.deskIndex !== undefined) return world.desks[d.deskIndex].agent || null;
    if (hit.object.isMesh && hit.object.visible && !hit.object.material.transparent) return null;
  }
  return null;
}

function setHovered(agent) {
  if (agent === hovered) return;
  hovered?.setHighlight(false);
  agent?.setHighlight(true);
  hovered = agent;
}

function toNdc(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  return pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
}

let pendingMove = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (view !== 'orbit') return;
  // Raycasting the whole room is not free: do it at most once per frame.
  if (!pendingMove) requestAnimationFrame(() => {
    const agent = agentAt(toNdc(pendingMove));
    setHovered(agent);
    document.body.classList.toggle('hovering', !!agent);
    pendingMove = null;
  });
  pendingMove = e;
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (view === 'walk') {
    if (walker.locked) { if (aimed) focusAgent(aimed); }
    else if (!flight) walker.lock();
  }
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (view !== 'orbit') return;
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
  const agent = agentAt(toNdc(e));
  if (agent) focusAgent(agent);
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return;
  if (e.key === 'Escape') {
    if (view === 'orbit') unfocus();
    else if (focused) { focused = null; hud.hidePanel(); syncWalkHud(); }
  }
  if (e.code === 'KeyF' && view === 'orbit') enterWalk();
  if (e.code === 'KeyO') view === 'walk' ? exitWalk() : unfocus();
});

// Loop ------------------------------------------------------------------------------
let baseFov = 30;
function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  ink.setSize(w, h, renderer.getPixelRatio());
  camera.aspect = w / h;
  // Pull back on narrow screens so the whole office still fits.
  baseFov = w / h < 1 ? 42 : 30;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
camera.fov = baseFov;
camera.updateProjectionMatrix();

const clamp = THREE.MathUtils.clamp;
const timer = new THREE.Timer();
timer.connect(document);
let slowTimer = 0;

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();
  const now = Date.now();

  updateFlight(dt);
  if (view === 'orbit') {
    controls.target.set(clamp(controls.target.x, ROOM.minX, ROOM.maxX), clamp(controls.target.y, 0, 3), clamp(controls.target.z, ROOM.minZ, ROOM.maxZ));
    controls.update();
  } else if (!flight) {
    walker.update(dt);
  }

  // Ease between the telephoto overview lens and a natural first-person one.
  const fov = THREE.MathUtils.damp(camera.fov, view === 'walk' ? WALK_FOV : baseFov, 5, dt);
  if (Math.abs(fov - camera.fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  world.update(dt, t, now);
  manager.tick(dt, t, now, camera);

  // Whatever the crosshair is on, within arm's reach of a few metres.
  if (view === 'walk' && walker.locked && !flight && ++aimFrame % 3 === 0) {
    aimed = agentAt(CENTER, 7);
    setHovered(aimed);
    hud.setAim(aimed);
  } else if (view === 'walk' && !walker.locked && aimed) {
    aimed = null;
    setHovered(null);
    hud.setAim(null);
  }

  if (focused && focused.phase === 'gone') {
    hud.toast('✨ That agent finished and vanished.');
    unfocus();
  }

  slowTimer -= dt;
  if (slowTimer <= 0) {
    slowTimer = 0.5;
    const agents = manager.list();
    world.room.dashboard.draw(agents, now, feed.state === 'offline' ? 'offline' : 'live');
    world.room.whiteboard.draw(agents, manager.done);
    hud.update(agents, feed.state, now);
  }

  ink.render();
  labels.render(scene, camera);
});

// Handy for poking at things from the console while developing.
if (import.meta.env.DEV) {
  Object.assign(window, { meeseeks: { scene, camera, controls, world, manager, feed, ink, walker, enterWalk, exitWalk } });
}
