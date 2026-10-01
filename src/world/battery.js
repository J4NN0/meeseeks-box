import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { box, cyl, mesh, noInk, sphere, toon } from '../engine/toon.js';
import { BAY, BAY_FLOOR, CAR, band, bayOutline, hoodGeometry, hullPoint } from './car.js';
import { glowTexture } from './screens.js';

// The microverse battery from "The Ricks Must Be Crazy": a glowing magenta
// box in the engine bay of Rick's car, with a remote on a cord to shrink
// down into it. The hood pops open by itself when there's a universe in
// there (the office upstairs ran out of desks). You can also open it to have
// a look: until it's needed the box sits dark and the remote does nothing.
//
// Everything here is in the car's frame (car.js): +x towards the nose, +z
// towards the room. The bay is sunk into the nose, under an opening in the
// hull that the hood closes.

// Up, but clear of the windscreen: the closed hood slopes towards the nose.
const HOOD_OPEN = 1.5;
const HOOD_THICKNESS = 0.03;

const PANEL = new THREE.Color('#e53fd9');
const PANEL_HOT = new THREE.Color('#ffd6fb');
const PANEL_IDLE = new THREE.Color('#7a3a7e');

function microverse() {
  const g = new THREE.Group();
  const w = 0.2, h = 0.15, d = 0.18, t = 0.016;
  const frame = toon('#151316');
  g.add(box(w + 0.02, 0.03, d + 0.02, frame, 0, -h / 2 + 0.005, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(t, h, t, frame, (sx * w) / 2, 0, (sz * d) / 2));
  for (const sz of [-1, 1]) g.add(box(w, t, t, frame, 0, h / 2, (sz * d) / 2));
  for (const sx of [-1, 1]) g.add(box(t, t, d, frame, (sx * w) / 2, h / 2, 0));
  const panelMat = new THREE.MeshBasicMaterial({ color: PANEL.clone(), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
  const glass = mesh(new THREE.BoxGeometry(w - 0.006, h - 0.02, d - 0.006), panelMat, { cast: false });
  glass.position.y = 0.005;
  g.add(glass);

  // Inside: a little door and three eyestalks, staring at whoever looks in.
  g.add(box(0.04, 0.05, 0.01, '#2a1630', 0, -0.036, 0.016));
  g.add(box(0.024, 0.035, 0.012, '#120a14', 0, -0.04, 0.018));
  const stalks = [[-0.05, 0.045], [0, 0.065], [0.05, 0.045]].map(([x, len]) => {
    const stalk = new THREE.Group();
    stalk.position.set(x, -0.062, -0.016);
    stalk.add(cyl(0.003, 0.003, len, '#2a1630', 6).translateY(len / 2));
    const eye = sphere(0.016, '#fbfbf6', 12);
    eye.position.y = len;
    stalk.add(eye);
    const pupil = sphere(0.006, '#1b1512', 8);
    pupil.position.set(0, len, 0.0145);
    stalk.add(pupil);
    g.add(stalk);
    return stalk;
  });
  g.add(box(0.1, 0.003, 0.003, '#2a1630', 0, -0.062, -0.016));
  return { group: g, panelMat, stalks };
}

function remote() {
  const g = new THREE.Group();
  g.add(box(0.1, 0.035, 0.06, '#4a4f57', 0, 0, 0));
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fff3a0' });
  for (const z of [-0.015, 0.015]) g.add(mesh(new THREE.SphereGeometry(0.007, 8, 6), lightMat, { cast: false }).translateX(0.05).translateZ(z));
  const button = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 14), new THREE.MeshBasicMaterial({ color: '#e74c3c' }));
  button.position.y = 0.022;
  g.add(button);
  const antenna = cyl(0.003, 0.003, 0.11, '#8a9099', 6);
  antenna.rotation.z = Math.PI / 2 - 0.25;
  antenna.position.set(-0.1, 0.02, 0);
  g.add(antenna);
  g.add(sphere(0.006, '#8a9099', 6).translateX(-0.155).translateY(0.034));
  return { group: g, button, lightMat };
}

/** `inside` names the universe in this battery; `onEnter` runs when its tag is clicked. */
export function createBattery({ inside, onEnter }) {
  const group = new THREE.Group();
  group.position.set(CAR.x, 0, CAR.z);
  group.rotation.y = CAR.rot;

  // The engine bay: a tub sunk into the nose, walls straight down from the
  // opening to a flat floor.
  const bay = new THREE.Group();
  bay.visible = false;
  group.add(bay);
  const rim = bayOutline(-0.003);
  const bottom = rim.map((p) => new THREE.Vector3(p.x, BAY_FLOOR, p.z));
  const walls = mesh(band(rim, bottom), toon('#3a3f47', { side: THREE.DoubleSide }), { cast: false });
  const floorShape = new THREE.Shape(bottom.map((p) => new THREE.Vector2(p.x, -p.z)));
  const floor = mesh(new THREE.ShapeGeometry(floorShape).rotateX(-Math.PI / 2).translate(0, BAY_FLOOR, 0), toon('#24272c', { side: THREE.DoubleSide }), { cast: false });
  walls.userData.car = floor.userData.car = true;
  bay.add(walls, floor);

  // The hood: a slab of hull with some thickness, lifting towards the
  // windscreen like a car bonnet. The opening's back edge curves back at the
  // sides, so the hinge sits level with its corners: hinged further forward,
  // the corners would swing down into the bay.
  const hinge = hullPoint(Math.PI, BAY.from).setX(hullPoint(Math.PI - BAY.phi, BAY.from).x);
  const hood = new THREE.Group();
  hood.position.copy(hinge);
  group.add(hood);
  const lid = [
    [hoodGeometry(0.004, 10, 10), '#aeb6be'],
    [hoodGeometry(-HOOD_THICKNESS, 10, 10), '#8b939c'],
    [band(bayOutline(0.004), bayOutline(-HOOD_THICKNESS)), '#6f7780'],
  ];
  for (const [geometry, color] of lid) {
    const part = mesh(geometry.translate(-hinge.x, -hinge.y, -hinge.z), toon(color, { side: THREE.DoubleSide }));
    part.userData.car = true;
    hood.add(part);
  }
  // Duct-taped canisters on the underside, because it's Rick's car.
  for (const side of [-1, 1]) {
    const at = hullPoint(Math.PI + side * 0.42, BAY.from + (BAY.to - BAY.from) * 0.42, -HOOD_THICKNESS - 0.028).sub(hinge);
    hood.add(box(0.1, 0.05, 0.08, '#8c8a3a', at.x, at.y, at.z));
    hood.add(box(0.11, 0.015, 0.09, '#d9dde2', at.x, at.y + 0.016, at.z));
  }

  // The microverse, on the bay floor.
  const box3 = microverse();
  // Everything in the bay stays under the closed hood, so nothing pokes
  // through it while it shuts.
  const core = new THREE.Vector3(1.2, BAY_FLOOR + 0.085, 0.1);
  box3.group.position.copy(core);
  bay.add(box3.group);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture('#ff4fd8'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
  const halo = noInk(new THREE.Sprite(glowMat));
  halo.scale.setScalar(0.55);
  halo.position.copy(core);
  bay.add(halo);

  // The rest of the engine, as seen in the show.
  const globe = sphere(0.085, '#9bd84f', 20);
  globe.position.set(1.25, BAY_FLOOR + 0.085, -0.16);
  bay.add(globe);
  const ring = mesh(new THREE.TorusGeometry(0.08, 0.01, 8, 28), toon('#4f7d32'));
  ring.position.copy(globe.position);
  ring.rotation.y = Math.PI / 2 + 0.3;
  bay.add(ring);
  bay.add(cyl(0.032, 0.032, 0.12, '#f2a33a', 14).translateX(1.14).translateY(BAY_FLOOR + 0.06).translateZ(-0.05));
  const dome = mesh(new THREE.SphereGeometry(0.07, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon('#6ec6ee', { transparent: true, opacity: 0.7 }));
  dome.position.set(1.18, BAY_FLOOR + 0.03, -0.37);
  bay.add(dome);
  bay.add(cyl(0.075, 0.075, 0.03, '#4f7d32', 18).translateX(1.18).translateY(BAY_FLOOR + 0.015).translateZ(-0.37));

  // The remote, on a cord to the box: press it to shrink down.
  const rem = remote();
  rem.group.position.set(1.42, BAY_FLOOR + 0.02, -0.01);
  rem.group.rotation.y = 1.2;
  bay.add(rem.group);
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.4, BAY_FLOOR + 0.035, 0.0),
    new THREE.Vector3(1.41, BAY_FLOOR + 0.09, 0.03),
    new THREE.Vector3(1.36, BAY_FLOOR + 0.09, 0.07),
    new THREE.Vector3(1.305, core.y - 0.03, 0.08),
  ]);
  bay.add(mesh(new THREE.TubeGeometry(cord, 20, 0.006, 6), toon('#5a3a2e')));

  rem.group.traverse((o) => { if (o.isMesh) o.userData.gate = true; });
  box3.group.traverse((o) => { if (o.isMesh) o.userData.gateHint = true; });

  // Floating tag: where it leads and who's in there.
  const el = document.createElement('div');
  el.className = 'gate-tag';
  el.innerHTML = '<button class="plate" type="button"><span class="icon">🔋</span><span class="name"></span><span class="n"></span></button>';
  el.querySelector('.name').textContent = inside;
  el.querySelector('.plate').addEventListener('click', (e) => {
    e.stopPropagation();
    onEnter?.();
  });
  const wrapper = document.createElement('div');
  wrapper.append(el);
  const tag = new CSS2DObject(wrapper);
  tag.center.set(0.5, 1);
  tag.position.copy(core).add(new THREE.Vector3(0, 0.6, 0));
  tag.visible = false;
  group.add(tag);

  group.updateMatrixWorld(true);
  const toWorld = (x, y, z) => group.localToWorld(new THREE.Vector3(x, y, z));
  const coreWorld = group.localToWorld(core.clone());

  let open = false;
  let peek = false;
  let angle = 0;
  let zap = 0;
  let press = 0;
  let lastCount = -1;
  return {
    group,
    inside,
    /** Where agents stand to hop in, and where they pop out. */
    mouth: toWorld(1.05, 0, 1.15),
    /** The box itself, in world space. */
    core: coreWorld,
    /** A close look at the engine bay, and where to stand next to it. */
    view: { eye: toWorld(core.x + 1.0, core.y + 1.35, core.z + 0.7), look: coreWorld.clone() },
    stand: { at: toWorld(0.95, 0, 1.8), look: coreWorld.clone() },
    /** There's a universe in there (the office upstairs is full). */
    get open() { return open; },
    /** The hood is up, whether by itself or because you opened it. */
    get lifted() { return open || peek; },
    get count() { return Math.max(0, lastCount); },
    /** Opens or closes the hood for a look. It stays up while it's needed. */
    toggleHood() {
      if (!open) peek = !peek;
      return open || peek;
    },
    /** Hood open when agents are inside; `waiting` if any of them needs you. */
    set({ open: isOpen, count = 0, waiting = 0 }) {
      open = isOpen;
      if (count !== lastCount) {
        lastCount = count;
        el.querySelector('.n').textContent = count;
        el.title = `${count} agent${count === 1 ? '' : 's'} working in the ${inside}. Press the remote to go in.`;
      }
      el.classList.toggle('waiting', waiting > 0);
    },
    setHover(on) {
      el.classList.toggle('hover', on);
    },
    /** The remote's button goes down and its lights flash. */
    press() {
      press = 1;
    },
    /** Someone just went in or came out. */
    zap() {
      zap = 1;
    },
    update(dt, t) {
      const up = open || peek;
      angle = THREE.MathUtils.damp(angle, up ? HOOD_OPEN : 0, 4, dt);
      if (!up && angle < 0.002) angle = 0;
      hood.rotation.z = angle;
      // Nothing to see in there with the hood shut.
      bay.visible = angle > 0.01;
      tag.visible = open && angle > 0.9;
      if (!bay.visible) return;
      zap = Math.max(0, zap - dt * 3);
      press = Math.max(0, press - dt * 2.5);
      if (open) {
        box3.panelMat.color.copy(PANEL).lerp(PANEL_HOT, Math.max(zap, Math.sin(t * 2.4) * 0.12 + 0.12));
        glowMat.opacity = (0.55 + Math.sin(t * 2.4) * 0.12 + zap * 0.4) * Math.min(1, angle / HOOD_OPEN);
        box3.stalks.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.7 + i * 2) * 0.12; });
      } else {
        // Nobody home: the glass is dull and the eyestalks droop.
        box3.panelMat.color.copy(PANEL_IDLE);
        glowMat.opacity = 0.1;
        box3.stalks.forEach((s, i) => { s.rotation.z = (i - 1) * 0.35; });
      }
      rem.button.position.y = 0.022 - Math.sin(press * Math.PI) * 0.008;
      rem.lightMat.color.set(press > 0 && Math.sin(press * 40) > 0 ? '#ffffff' : '#fff3a0');
    },
  };
}
