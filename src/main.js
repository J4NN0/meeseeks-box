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
import { SITE, WALK_BOUNDS, PORTAL } from './world/room.js';
import { Multiverse } from './multiverse.js';
import { verse } from './world/verses.js';
import { christmasLightsOn, setChristmasLights } from './world/christmas-lights.js';
import { CAPACITY } from './agents/seating.js';
import { MissionControl } from './world/mission-control.js';
import { RecapBoard } from './world/recap-board.js';
import { post } from './data/api.js';
import { Feed } from './data/feed.js';
import { SimFeed, simCount } from './data/simulator.js';
import { TodayFeed } from './data/today.js';
import { Hud } from './ui/hud.js';
import { esc } from './ui/util.js';
import { Wipe } from './ui/wipe.js';
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

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
/** Inside a battery, far enough to see the batteries it's nested in (world/backdrop.js). */
const BACKDROP_FAR = 3000;
enableInkLayers(camera);
// The garage and the living room next door, from the front right.
const HOME = { eye: new THREE.Vector3(14.8, 16.2, 26.7), look: new THREE.Vector3(3.3, 0.2, -0.4) };
// Where you "stand" when you step into the room: just behind the box.
const WALK_START = { eye: new THREE.Vector3(0, EYE_HEIGHT, 5.6), look: new THREE.Vector3(0, 1.2, 0) };
const WALK_FOV = 70;
camera.position.copy(HOME.eye);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.look);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 40;
// Don't let the overview dip below the floor line; board close-ups relax it.
const ORBIT_MAX_POLAR = 1.42;
controls.maxPolarAngle = ORBIT_MAX_POLAR;
controls.minAzimuthAngle = -0.35;
controls.maxAzimuthAngle = 1.45;
controls.screenSpacePanning = true;
controls.update();

// World ---------------------------------------------------------------------
// The wall boards are shared by the garage and every universe in its battery.
const dashboard = new MissionControl();
const whiteboard = new RecapBoard();
// `?sim` in dev: pretend sessions, to try the office full (data/simulator.js).
const sim = import.meta.env.DEV ? simCount() : null;
const feed = sim === null ? new Feed() : new SimFeed(sim, {
  // The nappers in the office you're in go for a coffee, as many as there's room for.
  coffee() {
    const { manager } = here();
    for (const agent of manager.agents.values()) manager.coffee.send(agent);
  },
});
const today = new TodayFeed();
dashboard.setProvider(store.get('limits', 'claude'));
setChristmasLights(store.get('lights', 'on') === 'on');
// Left over from when you could pick other mascots.
try { localStorage.removeItem('meeseeks:mascots'); } catch { /* private mode */ }
const bootAt = performance.now();

const multiverse = new Multiverse({
  boards: { dashboard, whiteboard },
  onEvent(type, agent) {
    // Don't greet every pre-existing session with a toast on page load.
    if (type === 'spawn' && performance.now() - bootAt < 8000) return;
    hud.announce(type, agent);
  },
  // A name tag: click to inspect, right-click to slap.
  // One walking through into the battery: its tag takes you to where it'll work.
  onClick: (agent, { slap: smack } = {}) => (smack ? slap({ agent }) : agent.passing ? goToAgent(agent.id) : focusAgent(agent)),
  onEnterGate: (level) => enterGate(level),
  onCollapse: () => collapse(),
});
// The office on screen: the garage, or a universe in its car battery.
const here = () => multiverse.active;

const ink = new InkRenderer(renderer, here().scene, camera);
ink.enabled = CONFIG.ink;

// Every office has the same floor plan, so the garage's colliders fit all.
const walker = new Walker(camera, renderer.domElement, { colliders: here().world.colliders, bounds: WALK_BOUNDS, portal: PORTAL });
let view = 'orbit'; // orbit | walk

const hud = new Hud({
  onWalk: () => (view === 'walk' ? walker.lock() : enterWalk()),
  onMeeting: () => toggleMeeting(),
  onReset: () => (view === 'walk' ? exitWalk() : unfocus()),
  onClosePanel: () => closePanel(),
  onGoToAgent: (id) => act({ kind: 'agent', agentId: id }),
  onVerse: (level) => travelTo(level),
  box: {
    folders: boxFolders,
    remember(folder) {
      store.set('box-folders', JSON.stringify([folder, ...recentBoxFolders().filter((f) => f !== folder)].slice(0, 6)));
    },
    refresh: () => feed.poll(),
    gone(id) {
      multiverse.end(id);
      feed.poll();
    },
    failed: (message) => hud.toast(`💥 ${esc(message)}`),
    close: () => closePanel(),
  },
});

feed.onChange((sessions) => {
  multiverse.sync(sessions, Date.now());
  hud.setVerses(multiverse.summary(), here().level);
});
feed.start();
today.onChange(() => whiteboard.draw(today.data, multiverse.roster(Date.now()), Date.now()));
today.start();

// Camera moves -----------------------------------------------------------------
let flight = null;
// Diving into or climbing out of the battery: the trip owns the camera.
let traveling = false;
let focused = null;
const lookTmp = new THREE.Vector3();

function currentLook() {
  if (view === 'orbit') return controls.target.clone();
  return camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(5));
}

/** `onCancel` runs instead of `onDone` if another move takes over first. */
function flyTo(eye, look, { duration = 1.1, onDone, onCancel } = {}) {
  cancelFlight();
  flight = { fromEye: camera.position.clone(), fromLook: currentLook(), eye, look, t: 0, duration, onDone, onCancel };
}

function cancelFlight() {
  const f = flight;
  flight = null;
  f?.onCancel?.();
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

/** Right-click: a hand swings in and slaps the Meeseeks (or helper) you're on. */
function slap(target) {
  if (traveling || !target?.agent) return;
  target.agent.slap(camera, target.who);
}

function focusAgent(agent) {
  if (traveling) return;
  focused = agent;
  leaveBoard();
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

// The wall boards: in the overview, the first click flies up to one; after
// that its items are clickable. Walking, you just aim and click. The meeting
// room's floating screens work the same.
let focusedBoard = null;
const boardFaces = () => {
  const { room } = here().world;
  return [room.tvScreen, room.wbFace, ...room.living.meeting.calls.faces()];
};

/**
 * Where to stand to read a board: square on, far enough to fit it. With the
 * side panel open, slide over so the board sits in the space left of it.
 */
function boardView(face, withPanel = false) {
  const center = face.getWorldPosition(new THREE.Vector3());
  const q = face.getWorldQuaternion(new THREE.Quaternion());
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const { width, height } = face.geometry.parameters;
  const tan = Math.tan(THREE.MathUtils.degToRad(baseFov / 2));
  const covered = withPanel && innerWidth > 900 ? (document.getElementById('panel').offsetWidth + 32) / innerWidth : 0;
  const d = Math.max((height * 1.2) / 2 / tan, (width * 1.08) / 2 / (tan * camera.aspect * (1 - covered)));
  const look = center.clone().addScaledVector(right, covered * d * tan * camera.aspect);
  const eye = look.clone().addScaledVector(normal, d);
  eye.y += d * 0.04;
  return { eye, look };
}

function faceOf(board) {
  return boardFaces().find((f) => f.userData.board === board);
}

function focusBoard(board) {
  if (traveling) return;
  const face = faceOf(board);
  if (!face) return;
  focused = null;
  hud.hidePanel();
  focusedBoard = board;
  document.body.classList.add('board-focus');
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  const { eye, look } = boardView(face);
  flyTo(eye, look);
}

function leaveBoard() {
  focusedBoard = null;
  document.body.classList.remove('board-focus');
}

function openProject(key, focus) {
  if (traveling) return;
  focused = null;
  hud.showProject(key, focus);
  if (view === 'walk') {
    walker.unlock();
    syncWalkHud();
  } else if (focusedBoard) {
    const { eye, look } = boardView(faceOf(focusedBoard), true);
    flyTo(eye, look, { duration: 0.6 });
  }
}

/** Runs a board item's action. */
function act(action) {
  if (action.kind === 'agent') {
    goToAgent(action.agentId);
  } else if (action.kind === 'project') {
    openProject(action.key, action.focus);
  } else if (action.kind === 'limits') {
    dashboard.setProvider(action.provider);
    store.set('limits', action.provider);
  } else if (action.kind === 'gate') {
    // Diving in presses it on the way; an empty one still clicks.
    if (!multiverse.isOpen(action.level)) here().world.battery.press();
    enterGate(action.level);
  } else if (action.kind === 'portal') {
    climbOut({ via: 'portal' });
  } else if (action.kind === 'hint') {
    if (multiverse.isOpen(action.level)) hud.toast(`🔋 Press the remote in the engine bay (or its tag) to go into the ${verse(action.level).name}.`);
    else hud.toast(emptyVerse(action.level));
  } else if (action.kind === 'hood') {
    toggleHood();
  } else if (action.kind === 'remote') {
    if (traveling) return;
    here().world.room.living.changeChannel();
    watchTv();
  } else if (action.kind === 'tv') {
    watchTv();
  } else if (action.kind === 'meeting') {
    toggleMeeting();
  } else if (action.kind === 'lights') {
    setChristmasLights(!christmasLightsOn());
    store.set('lights', christmasLightsOn() ? 'on' : 'off');
  } else if (action.kind === 'coffee') {
    here().world.room.coffeeBar.use(action.part, action.index);
  } else if (action.kind === 'box') {
    summon();
  }
}

function recentBoxFolders() {
  try { return JSON.parse(store.get('box-folders', '[]')).filter((f) => typeof f === 'string'); } catch { return []; }
}

/**
 * Folders to offer a Meeseeks from the box: the ones you last gave one, then
 * where your sessions work, most recent first.
 */
function boxFolders() {
  const worked = [...feed.sessions.filter((s) => !s.box), ...(today.data?.sessions || [])]
    .filter((s) => s.cwd)
    .sort((a, b) => (b.lastActivityAt || b.lastAt || 0) - (a.lastActivityAt || a.lastAt || 0))
    .map((s) => s.cwd);
  return [...new Set([...recentBoxFolders(), ...worked])];
}

/** The Meeseeks you just summoned: its panel opens once it's out of the box. */
let summoned = null;

/** Pressing the box: out comes a Meeseeks, to be told what it's for. */
async function summon() {
  if (traveling) return;
  here().world.box.press();
  try {
    // Simulating, it's one more pretend agent: no real session.
    const { id } = sim === null ? await post('/api/box/new') : { id: feed.add() };
    if (!id) return;
    summoned = { id, at: performance.now() };
    feed.poll();
  } catch (e) {
    hud.toast(`📦 ${e.message}`);
  }
}

/** Opens the summoned Meeseeks' panel as soon as it's out (wherever the seating put it). */
function meetSummoned() {
  if (!summoned) return;
  const record = multiverse.find(summoned.id);
  if (!record) {
    if (performance.now() - summoned.at > 10_000) summoned = null;
    return;
  }
  if (record.level !== here().level) {
    goToAgent(summoned.id);
    summoned = null;
    return;
  }
  const agent = here().manager.byId(summoned.id);
  if (agent?.phase === 'arriving' && agent.phaseTime > 0.6) {
    summoned = null;
    focusAgent(agent);
  }
}

/**
 * The meeting bell (or the HUD button, or M): everyone, wherever they are,
 * to the meeting room, or back to their desks. In the overview, fly over to
 * watch them come in.
 */
function toggleMeeting() {
  if (traveling) return;
  const on = !multiverse.meeting;
  const { meeting } = here().world.room.living;
  multiverse.setMeeting(on);
  meeting.bell.ring();
  hud.setMeeting(on);
  // Only so many universes fit on screen; the toast names those.
  const calls = meeting.calls.set(multiverse.calls(Date.now()), Date.now());
  if (on) {
    const remote = calls.map((c) => `the ${c.name}`);
    hud.toast(`📣 Meeting! Everyone to the meeting room.${remote.length ? ` ${remote.join(' and ')} join${remote.length > 1 ? '' : 's'} on screen.` : ''}`);
    if (view === 'orbit') {
      focused = null;
      leaveBoard();
      hud.hidePanel();
      flyTo(meeting.view.eye.clone(), meeting.view.look.clone(), { duration: 1.4 });
    }
  } else {
    hud.toast('👋 Meeting\'s over: back to work, everyone!');
    // Looking at a screen that's going away: back out.
    if (focusedBoard && meeting.calls.faces().some((f) => f.userData.board === focusedBoard)) unfocus();
  }
}

/** In the overview, fly round behind the living room couch to watch TV. */
function watchTv() {
  if (traveling || view !== 'orbit') return;
  const { eye, look } = here().world.room.living.view;
  if (camera.position.distanceTo(eye) < 0.5) return;
  focused = null;
  leaveBoard();
  hud.hidePanel();
  flyTo(eye.clone(), look.clone());
}

/** Focuses an agent by id, travelling to its universe first if need be. */
function goToAgent(id, retried = false) {
  const record = multiverse.find(id);
  if (!record) return hud.toast('✨ That agent already finished and vanished.');
  if (record.level !== here().level && !retried) {
    travelTo(record.level, { then: () => goToAgent(id, true) });
    return;
  }
  const agent = here().manager.byId(id);
  if (agent && agent.phase !== 'gone' && agent.phase !== 'leaving' && agent.phase !== 'departing') focusAgent(agent);
  else if (agent || record.level !== here().level) hud.toast('🔋 That agent is on its way to another desk. Try again in a moment.');
  else hud.toast('🚶 That agent is still on its way in. Try again in a moment.');
}

/** The panel's ✕: on a board, just close it; otherwise go back out. */
function closePanel() {
  if (traveling) return;
  if (!focusedBoard || view !== 'orbit') return unfocus();
  if (!hud.panelOpen) return unfocus();
  hud.hidePanel();
  const { eye, look } = boardView(faceOf(focusedBoard));
  flyTo(eye, look, { duration: 0.6 });
}

function unfocus() {
  if (traveling) return;
  focused = null;
  leaveBoard();
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
  if (traveling) return;
  if (view === 'walk') return;
  focused = null;
  leaveBoard();
  hud.hidePanel();
  view = 'walk';
  controls.enabled = false;
  // Pointer lock must be requested from the click itself, so lock now and fly in.
  walker.lock();
  flyTo(WALK_START.eye.clone(), WALK_START.look.clone(), {
    duration: 1.4,
    onDone: () => {
      // Close the room up only once we're inside, so we don't fly through a wall.
      here().world.room.setEnclosed(true);
      walker.start(camera.position);
      syncWalkHud();
    },
  });
  syncWalkHud();
}

function exitWalk() {
  if (traveling) return;
  if (view !== 'walk') return;
  const look = currentLook();
  walker.stop();
  here().world.room.setEnclosed(false);
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
  focused = null;
  if (hud.panelOpen) hud.hidePanel();
  syncWalkHud();
});
walker.addEventListener('unlock', syncWalkHud);
/** The green blink of going through Rick's portal. */
function portalFlash() {
  const flash = document.getElementById('portal-flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');
}
/** How long the blink takes to cover the screen (see .portal-flash in style.css). */
const PORTAL_FLASH_PEAK_S = 0.135;

walker.addEventListener('portal', () => {
  // Inside the battery, the portal is the way out, up a level.
  if (here().level > 0) {
    climbOut({ via: 'portal' });
    return;
  }
  // Wubba lubba dub dub: step through Rick's portal, come out by the car.
  portalFlash();
  walker.teleport(7.2, -1.2, new THREE.Vector3(-2, 1.3, 0.5));
  hud.toast('🌀 Wubba lubba dub dub!');
});
walker.addEventListener('resuming', syncWalkHud);
// A refused lock just leaves you paused; the next click tries again.
walker.addEventListener('lockfailed', syncWalkHud);

// Universes in the battery ------------------------------------------------------
// Diving in: lean over the car's open hood, press the remote, get sucked into
// the swirl and drop into the office inside from high above. Climbing out:
// the swirl shrinks back into the box you came out of as the camera pulls back.
const wipe = new Wipe(document.getElementById('wipe'));
let collapsing = false;

/** Resolves when the camera gets there, or when another move cuts in. */
function fly(eye, look, duration) {
  return new Promise((resolve) => flyTo(eye, look, { duration, onDone: resolve, onCancel: resolve }));
}

/** Leaning over the engine bay, close enough to reach the remote. */
function batteryView(world) {
  const { eye, look } = world.battery.view;
  return { eye: eye.clone(), look: look.clone() };
}

/** Diving in, in seconds: the ray locks on, you shrink into the box, and drop in down the far side. */
const SHRINK_IN = { aim: 0.3, dive: 0.95, drop: 1.15 };
const wait = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));

/** Dropping into a universe: high above the Meeseeks Box, then down by it. */
function landing(world) {
  // Just in front of the box, not on top of it.
  const spot = world.spawnPoint.clone().add(new THREE.Vector3(0, 0, 1.1));
  return {
    spot,
    sky: { eye: spot.clone().add(new THREE.Vector3(0.8, 18, 3)), look: spot.clone() },
    ground: { eye: spot.clone().add(new THREE.Vector3(2.6, 2.4, 5.2)), look: spot.clone().add(new THREE.Vector3(0, 0.8, 0)) },
  };
}

/** Where the microverse box is on screen, in CSS pixels. */
function batteryOnScreen(world) {
  const p = world.battery.core.clone();
  camera.updateMatrixWorld();
  p.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
}

function emptyVerse(level) {
  return `🔋 Nobody's working in the ${verse(level).name} yet. It opens when all ${CAPACITY} desks ${level > 1 ? `in the ${verse(level - 1).name}` : 'in the garage'} are taken.`;
}

/** The remote (or its tag): in you go, if there's anyone in there. */
function enterGate(level) {
  if (multiverse.isOpen(level)) travelTo(level);
  else hud.toast(emptyVerse(level));
}

/** Clicking the car: pop the hood for a look, or shut it again. */
function toggleHood() {
  if (traveling) return;
  const { world } = here();
  if (world.battery.open) {
    hud.toast(`🔋 The hood stays open while agents work in the ${world.battery.inside}.`);
  } else if (!world.battery.toggleHood()) {
    return;
  }
  // Lean in for a look (walking, you're already there).
  if (view === 'orbit' && world.battery.lifted) {
    focused = null;
    leaveBoard();
    hud.hidePanel();
    const { eye, look } = batteryView(world);
    flyTo(eye, look);
  }
}

/** Up a level, from inside the battery (or as far up as there's anyone, if it emptied out). */
function climbOut({ via } = {}) {
  if (here().level > 0) travelTo(Math.min(here().level, multiverse.needed) - 1, { via });
}

/** In front of Rick's portal on the left wall, looking at it. */
function portalView() {
  const look = new THREE.Vector3(PORTAL.x, PORTAL.y, PORTAL.z);
  return { eye: look.clone().add(new THREE.Vector3(4.2, 0.9, 1.4)), look };
}

/**
 * `via: 'portal'` climbs out through Rick's portal on the wall instead of
 * out of the battery, and comes out of the one upstairs.
 */
async function travelTo(level, { then, via } = {}) {
  if (traveling) {
    if (then) hud.toast('🔋 Hang on, still on the way. Try again in a moment.');
    return;
  }
  if (level === here().level || !multiverse.isOpen(level)) return;
  traveling = true;
  try {
    await travel(level, via);
  } catch (err) {
    console.error('travel failed', err);
    return;
  } finally {
    traveling = false;
  }
  if (view === 'walk') syncWalkHud();
  then?.();
}

async function travel(level, via) {
  const from = here();
  const down = level > from.level;
  const portal = !down && via === 'portal';
  const portalPoint = new THREE.Vector3(PORTAL.x, PORTAL.y, PORTAL.z);
  const walking = view === 'walk';
  focused = null;
  leaveBoard();
  hud.hidePanel();
  setPointed(null);
  aimed = null;
  hud.setAim(null);
  if (walking) syncWalkHud();

  if (down && !walking) {
    const { eye, look } = batteryView(from.world);
    await fly(eye, look, 0.9);
  }
  if (down) {
    // As a Meeseeks goes in: the remote clicks, and you shrink right down
    // into the box, its glass filling the screen.
    const { core } = from.world.battery;
    from.world.battery.press();
    await wait(SHRINK_IN.aim);
    // Right up to the box: closer than the orbit lets you get, just this once.
    const minDistance = controls.minDistance;
    controls.minDistance = 0;
    try {
      if (!walking) await fly(core.clone().add(camera.position.clone().sub(core).setLength(0.06)), core.clone(), SHRINK_IN.dive);
      else await wait(SHRINK_IN.dive * 0.6);
      await wipe.cover({ flash: '#e53fd9' });
    } finally {
      controls.minDistance = minDistance;
    }
  } else {
    // Through the portal, it's the portal's green and nothing else, as in the garage.
    if (portal && !walking) {
      const { eye, look } = portalView();
      await fly(eye, look, 0.8);
    }
    // Through the portal: the same green blink as in the garage, swapping
    // universes as it peaks.
    if (portal) {
      portalFlash();
      await wait(PORTAL_FLASH_PEAK_S);
    } else await wipe.cover({ name: verse(level).name, sub: 'climbing out of the battery…', from: null });
  }

  // Swap universes while the screen is covered.
  if (walking) from.world.room.setEnclosed(false);
  multiverse.enter(level, Date.now());
  const to = here();
  ink.scene = to.scene;
  camera.far = level ? BACKDROP_FAR : 200;
  camera.updateProjectionMatrix();
  document.body.dataset.verse = level ? String(((level - 1) % 3) + 1) : '';
  // The page behind the scene, in the same colour as the fog (verses.js).
  document.body.style.setProperty('--space', level ? verse(level).space : null);
  hud.setVerses(multiverse.summary(), level);
  cancelFlight();
  if (walking) {
    to.world.room.setEnclosed(true);
    // Left mid fly-in, before enterWalk got to start walking.
    if (!walker.active) walker.start(camera.position);
    const { at, look } = to.world.battery.stand;
    if (down) walker.teleport(WALK_START.eye.x, WALK_START.eye.z, WALK_START.look);
    else if (portal) walker.teleport(PORTAL.x + 1.6, PORTAL.z, portalPoint.clone().setY(1.4).add(new THREE.Vector3(4, 0, 0)));
    else walker.teleport(at.x, at.z, look);
  } else {
    // Down: drop in from high above, down a ray. Up: start at the battery, pull back.
    const start = down ? landing(to.world).sky : portal ? portalView() : batteryView(to.world);
    camera.position.copy(start.eye);
    controls.target.copy(start.look);
    controls.update();
  }
  // Compile any new shaders now, not on the first visible frame.
  renderer.compile(to.scene, camera);

  // Down: fade out while dropping in. Up: shrink into the box, then pull back.
  if (down) {
    // Drop in from high above, landing by the Meeseeks Box, then pull back
    // to the overview.
    const reveal = wipe.reveal({ to: null, duration: 450 });
    if (walking) {
      await reveal;
    } else {
      const { ground } = landing(to.world);
      await fly(ground.eye, ground.look, SHRINK_IN.drop);
      flyTo(HOME.eye.clone(), HOME.look.clone(), { duration: 1.5 });
    }
  } else {
    if (!portal) await wipe.reveal({ to: walking ? null : batteryOnScreen(to.world) });
    if (!walking) flyTo(HOME.eye.clone(), HOME.look.clone(), { duration: 1.3 });
  }
}

/** The universe you're in emptied out: everyone fits upstairs again. */
function collapse() {
  if (collapsing) return;
  collapsing = true;
  hud.toast(`🔋 The ${here().verse.name} emptied out: everyone fits upstairs now.`);
  const retry = () => {
    if (here().level < multiverse.needed) {
      collapsing = false;
      return;
    }
    if (traveling) {
      setTimeout(retry, 400);
      return;
    }
    travelTo(multiverse.needed - 1).finally(() => { collapsing = false; });
  };
  setTimeout(retry, 1500);
}

// Picking -----------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
const pointer = new THREE.Vector2();
const CENTER = new THREE.Vector2(0, 0);
let hovered = null;
let aimed = null;
let aimFrame = 0;
let downAt = null;

/**
 * What's under a screen point: { agent, who } for a Meeseeks or its helpers
 * (`who` being the one hit), { agent } for its desk; { board, action } for a
 * wall board (action is null between items).
 */
function pick(ndc, maxDistance = Infinity) {
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = maxDistance;
  const { scene, world, manager } = here();
  for (const hit of raycaster.intersectObjects(scene.children, true)) {
    // Raycasts ignore visibility: skip what isn't on screen (the walk-mode
    // ceiling and walls while in the overview).
    if (!shown(hit.object)) continue;
    const d = hit.object.userData;
    if (d.agentId) {
      const agent = manager.byId(d.agentId);
      return agent ? { agent, who: agent.characterOf(hit.object) } : null;
    }
    if (d.deskIndex !== undefined) {
      const agent = world.desks[d.deskIndex].agent;
      return agent ? { agent } : null;
    }
    if (d.gate || d.gateHint) {
      // The box is the universe (who's in there); the remote takes you in.
      const level = world.level + 1;
      const name = verse(level).name;
      const n = world.battery.count;
      const open = world.battery.open;
      if (d.gate) return { gate: true, action: { id: 'gate', kind: 'gate', level, label: `${name} remote · ${open ? 'ready' : 'off'}` } };
      return { action: { id: 'gate-hint', kind: 'hint', level, label: `${name} · ${open ? `${n} agent${n === 1 ? '' : 's'}` : 'empty'}` } };
    }
    if (d.car) return { action: { id: 'car', kind: 'hood', label: 'Car' } };
    if (d.portal) return { action: { id: 'portal', kind: 'portal', label: `Portal · ${verse(world.level - 1).name}` } };
    if (d.remote) return { action: { id: 'remote', kind: 'remote', label: `TV remote · channel ${world.room.living.channel}\nclick to change channel` } };
    if (d.livingTv) return { action: { id: 'tv', kind: 'tv', label: `TV · channel ${world.room.living.channel}` } };
    if (d.meetingBell) return { action: { id: 'bell', kind: 'meeting', label: multiverse.meeting ? 'Meeting bell\nring to send everyone back to work' : 'Meeting bell\nring to call everyone to the meeting room' } };
    if (d.meeseeksBox) return { action: { id: 'box', kind: 'box', label: 'Meeseeks Box' } };
    if (d.coffeeBar) {
      // Nothing to do with it (the counter, with no mug in hand): just in the way.
      const label = world.room.coffeeBar.label(d.coffeeBar, d.coffeeIndex);
      return label ? { action: { id: `coffee-${d.coffeeBar}-${d.coffeeIndex}`, kind: 'coffee', part: d.coffeeBar, index: d.coffeeIndex, label } } : null;
    }
    if (d.christmasLights) return { action: { id: 'lights', kind: 'lights', label: `Christmas lights · ${christmasLightsOn() ? 'on' : 'off'}` } };
    if (d.board) return { board: d.board, action: d.board.actionAt(hit.uv) };
    if (hit.object.isMesh && !hit.object.material.transparent) return null;
  }
  return null;
}

function shown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function setPointed(target) {
  const agent = target?.agent || null;
  if (agent !== hovered) {
    hovered?.setHighlight(false);
    agent?.setHighlight(true);
    hovered = agent;
  }
  for (const face of boardFaces()) {
    const board = face.userData.board;
    board.setHover(target?.board === board ? target.action?.id : '');
  }
  here().world.battery.setHover(!!target?.gate);
}

/** A right-click, or a Control-click on a Mac. */
const secondary = (e) => e.button === 2 || (e.button === 0 && e.ctrlKey);

function toNdc(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  return pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
}

let pendingMove = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (view !== 'orbit') return;
  // Raycasting the whole room is not free: do it at most once per frame.
  if (!pendingMove) requestAnimationFrame(() => {
    const target = pick(toNdc(pendingMove));
    // A board's items only react once you've flown up to it.
    if (target?.board && target.board !== focusedBoard) target.action = null;
    setPointed(target);
    document.body.classList.toggle('hovering', !!(target?.agent || target?.board || target?.action));
    pendingMove = null;
  });
  pendingMove = e;
});
// Right-click slaps, so no browser menu over the office.
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerleave', () => {
  if (view === 'orbit') setPointed(null);
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (view === 'walk') {
    if (!walker.locked) { if (!flight) walker.lock(); }
    else if (secondary(e)) slap(aimed);
    else if (e.button !== 0) return;
    else if (aimed?.agent) focusAgent(aimed.agent);
    else if (aimed?.action) act(aimed.action);
  }
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (view !== 'orbit') return;
  // A drag orbits (or pans, with the right button) rather than clicks.
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
  if (e.button !== 0 && e.button !== 2) return;
  const target = pick(toNdc(e));
  if (secondary(e)) slap(target);
  else if (target?.agent) focusAgent(target.agent);
  else if (target?.board && target.board !== focusedBoard) focusBoard(target.board);
  else if (target?.action) act(target.action);
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return;
  // Typing a prompt in the panel: keys are text, and Esc just stops typing.
  if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.key === 'Escape') {
    // With nothing open, Esc climbs back out of the battery.
    if (view === 'orbit' && !hud.panelOpen && !focusedBoard && here().level > 0) climbOut();
    else if (view === 'orbit') closePanel();
    else if (hud.panelOpen) { focused = null; hud.hidePanel(); syncWalkHud(); }
  }
  if (e.code === 'KeyF' && view === 'orbit') enterWalk();
  if (e.code === 'KeyM' && !e.repeat) toggleMeeting();
  if (e.code === 'KeyO') view === 'walk' ? exitWalk() : unfocus();
});

// Loop ------------------------------------------------------------------------------
let baseFov = 30;
/** How wide (degrees, side to side) the overview must see to fit the office. */
const HOME_FOV_ACROSS = 44;
function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  ink.setSize(w, h, renderer.getPixelRatio());
  camera.aspect = w / h;
  // Widen the lens on narrower screens so the whole office still fits.
  const across = Math.tan(THREE.MathUtils.degToRad(HOME_FOV_ACROSS / 2));
  baseFov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(across / (w / h))), 30, 55);
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
  // Back from a board close-up: restore the overview's limit once we're out.
  if (!focusedBoard && !flight && controls.maxPolarAngle !== ORBIT_MAX_POLAR) controls.maxPolarAngle = ORBIT_MAX_POLAR;
  if (view === 'orbit') {
    controls.target.set(clamp(controls.target.x, SITE.minX, SITE.maxX), clamp(controls.target.y, 0, 3), clamp(controls.target.z, SITE.minZ, SITE.maxZ));
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

  multiverse.tick(dt, t, now, camera);
  meetSummoned();

  // Whatever the crosshair is on, within arm's reach of a few metres.
  if (view === 'walk' && walker.locked && !flight && ++aimFrame % 3 === 0) {
    aimed = pick(CENTER, 7);
    setPointed(aimed);
    hud.setAim(aimed);
  } else if (view === 'walk' && !walker.locked && aimed) {
    aimed = null;
    setPointed(null);
    hud.setAim(null);
  }

  if (focused && focused.phase === 'gone') {
    // Gone from this office doesn't mean done: it may have changed universe.
    const record = multiverse.find(focused.id);
    hud.toast(record ? `🔋 That agent moved to the ${verse(record.level).name}.` : '✨ That agent finished and vanished.');
    unfocus();
  }

  slowTimer -= dt;
  if (slowTimer <= 0) {
    slowTimer = 0.5;
    const agents = multiverse.roster(now);
    dashboard.draw(agents, now, { offline: feed.state === 'offline', today: today.data });
    here().world.room.living.meeting.calls.set(multiverse.calls(now), now);
    whiteboard.draw(today.data, agents, now);
    hud.update(agents, feed.state, now, today.data);
  }

  ink.render();
  labels.render(here().scene, camera);
});

// Handy for poking at things from the console while developing.
if (import.meta.env.DEV) {
  window.meeseeks = {
    camera, controls, multiverse, dashboard, whiteboard, feed, today, ink, walker, hud, enterWalk, exitWalk, focusAgent, focusBoard, act, pick, travelTo,
    get scene() { return here().scene; },
    get world() { return here().world; },
    get manager() { return here().manager; },
  };
}
