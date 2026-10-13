// The landing page's office: the real garage, empty, to turn round and look
// at. No walking, no agents; the demo (../demo/) has those. It only draws
// while it's on screen.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { InkRenderer, enableInkLayers } from '../src/engine/outline.js';
import { World } from '../src/world/index.js';
import { MissionControl } from '../src/world/mission-control.js';
import { RecapBoard } from '../src/world/recap-board.js';

// The app's overview (main.js): the garage and the living room, from the front right.
const HOME = { eye: new THREE.Vector3(14.8, 16.2, 26.7), look: new THREE.Vector3(3.3, 0.2, -0.4) };
const HOME_FOV_ACROSS = 44;

/** Puts the office in `stage`; resolves once its first frame is drawn. */
export function mountOffice(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const dashboard = new MissionControl();
  const whiteboard = new RecapBoard();
  const world = new World(scene, { boards: { dashboard, whiteboard } });

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  camera.position.copy(HOME.eye);
  enableInkLayers(camera);
  const ink = new InkRenderer(renderer, scene, camera);

  // Turn it round, nothing more: the page scrolls on, and the wheel with it.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.look);
  Object.assign(controls, {
    enableDamping: true,
    dampingFactor: 0.08,
    enableZoom: false,
    enablePan: false,
    rotateSpeed: 0.6,
    maxPolarAngle: 1.42,
    minAzimuthAngle: -0.35,
    maxAzimuthAngle: 1.45,
  });
  controls.update();
  // Got it: the hint can go.
  controls.addEventListener('start', () => stage.classList.add('turned'));

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h);
    ink.setSize(w, h, renderer.getPixelRatio());
    camera.aspect = w / h;
    // Wider on narrow screens, so the whole office still fits.
    const across = Math.tan(THREE.MathUtils.degToRad(HOME_FOV_ACROSS / 2));
    camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(across / (w / h))), 30, 55);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  let boardsAt = 0;
  // Drawn again once the boards' marker font is in.
  document.fonts?.ready.then(() => { dashboard.lastKey = whiteboard.lastKey = ''; boardsAt = 0; });

  const timer = new THREE.Timer();
  timer.connect(document);
  function frame(timestamp) {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    const now = Date.now();
    controls.update();
    world.update(dt, t, now, camera);
    if (now - boardsAt > 1000) {
      boardsAt = now;
      dashboard.draw([], now);
      whiteboard.draw(null, [], now);
    }
    ink.render();
  }

  stage.append(renderer.domElement);
  frame(performance.now());
  new IntersectionObserver(([entry]) => renderer.setAnimationLoop(entry.isIntersecting ? frame : null)).observe(stage);
}
