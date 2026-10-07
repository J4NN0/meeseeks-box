import * as THREE from 'three';
import { elasticOut } from '../engine/motion.js';
import { box, cyl, glow, mesh, noInk, ownToon, sphere, toon } from '../engine/toon.js';
import { glowTexture } from './screens.js';

// The coffee bar under the WUBBA LUBBA poster, and what's on it: an espresso
// machine, a keg of kombucha on tap, three mugs and a bowl of fruit.
//
// Click a mug to pick it up (it's in your hand, at the bottom of the view)
// and the machine to put it under the spout; click the machine again and it
// grinds and pours (or click the mug to take it back). Click the coffee once
// it's ready and you drink it there and then; the empty mug stays in your
// hand, for another. Click the mug in your hand, or the counter, to put it
// back in its spot. The tap pours a glass of kombucha, and clicking the
// glass drinks it. Click a fruit to eat it; it grows back in the bowl a
// while later.
//
// Every part is tagged `userData.coffeeBar` (machine, mug, tap, fruit), with
// `coffeeIndex` for which mug or fruit: `use()` runs it, `label()` names it.

const TOP = 0.95;
const MACHINE = { x: -0.45, z: -0.04 };
const MUG = { r: 0.038, h: 0.09, floor: 0.012 };
const MUGS = [
  { color: '#e74c3c', at: [0.5, 0.13], yaw: -0.5 },
  { color: '#f5f5f5', at: [0.63, 0.1], yaw: 0.4 },
  { color: '#3498db', at: [0.76, 0.14], yaw: -1.1 },
];
/** Where a mug stands to be filled: on the drip tray, under the spouts. */
const UNDER_SPOUT = new THREE.Vector3(MACHINE.x, TOP + 0.062, MACHINE.z + 0.07);
const SPOUT_Y = TOP + 0.245;
const BREW = { grind: 1, pour: 3.2 };
const SIP = 1.8;
/** A coffee, from the machine to your lips and down to the last drop. */
const DRINK = 2.6;
/**
 * Where a mug is in front of you, in your view: how far across and up it
 * (-1 to 1, from the middle), and how far away for it to look the same size
 * through any lens. In your hand, at the bottom right; drinking, in the middle.
 */
const HAND = { across: 0.62, up: -0.62, size: 0.17 };
const LIPS = { across: 0, up: -0.75, size: 0.3 };

const KEG = { x: 0.2, tapY: TOP + 0.19, tapZ: 0.235 };
const GLASS = { r: 0.03, h: 0.105, at: [KEG.x, 0.235] };
const POUR_GLASS = 2.4;

const BOWL = { x: 0.72, z: -0.12 };
const FRUITS = [
  { name: 'Apple', color: '#e74c3c', at: [-0.05, -0.03], stem: true },
  { name: 'Lemon', color: '#f1c40f', at: [0.05, -0.03], scale: [1.25, 0.85, 0.85] },
  { name: 'Apple', color: '#27ae60', at: [-0.05, 0.04], stem: true },
  { name: 'Orange', color: '#e67e22', at: [0.05, 0.04] },
];
const EAT = 0.55;
const REGROW = 30;

const COFFEE = '#4a2a14';
const KOMBUCHA = '#e7a43b';

export function createCoffeeBar() {
  const g = new THREE.Group();
  const counter = new THREE.Group();
  counter.add(box(1.8, 0.9, 0.6, '#c89560', 0, 0.45, 0));
  counter.add(box(1.86, 0.05, 0.64, '#ebe6da', 0, 0.925, 0));
  g.add(counter);

  const tag = (obj, part, index = -1) => obj.traverse((o) => {
    if (o.isMesh) Object.assign(o.userData, { coffeeBar: part, coffeeIndex: index });
  });
  /** Invisible, a bit bigger than what it's round, so small things are easy to hit. */
  const reach = (w, h, d, y = h / 2) => {
    const m = noInk(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false })));
    m.position.y = y;
    return m;
  };

  tag(counter, 'counter');

  // The espresso machine --------------------------------------------------------
  const machine = new THREE.Group();
  machine.position.set(MACHINE.x, 0, MACHINE.z);
  g.add(machine);
  const body = new THREE.Group();
  machine.add(body);
  const steel = '#c0c6ce';
  const dark = '#5d646e';
  const black = '#26282d';
  body.add(box(0.46, 0.05, 0.36, steel, 0, TOP + 0.025, 0));
  body.add(box(0.28, 0.012, 0.13, dark, 0, TOP + 0.056, 0.09));
  body.add(box(0.46, 0.27, 0.16, steel, 0, TOP + 0.185, -0.1));
  body.add(box(0.46, 0.11, 0.34, steel, 0, TOP + 0.375, -0.01));
  body.add(box(0.47, 0.015, 0.35, dark, 0, TOP + 0.43, -0.01));
  // The panel: power on, and the brew light while it's working.
  body.add(box(0.36, 0.06, 0.006, '#3a3f47', 0, TOP + 0.375, 0.163));
  const power = cyl(0.011, 0.011, 0.006, glow('#7dff6a'), 12);
  power.rotation.x = Math.PI / 2;
  power.position.set(-0.13, TOP + 0.375, 0.167);
  body.add(power);
  const brewLight = cyl(0.011, 0.011, 0.006, toon('#6b5a45'), 12);
  brewLight.rotation.x = Math.PI / 2;
  brewLight.position.set(0.13, TOP + 0.375, 0.167);
  body.add(brewLight);
  const brewLit = glow('#ffb347');
  const brewOff = brewLight.material;
  body.add(box(0.12, 0.022, 0.004, glow('#f4efe1'), 0, TOP + 0.375, 0.167));
  // The group head and the portafilter, its handle sticking out to the front.
  body.add(cyl(0.045, 0.05, 0.03, steel, 20).translateY(TOP + 0.305).translateZ(0.07));
  body.add(cyl(0.044, 0.038, 0.03, dark, 20).translateY(TOP + 0.275).translateZ(0.07));
  const handle = cyl(0.014, 0.017, 0.13, black, 10);
  handle.rotation.x = Math.PI / 2 - 0.12;
  handle.position.set(0, TOP + 0.283, 0.17);
  body.add(handle);
  for (const s of [-1, 1]) body.add(cyl(0.006, 0.008, 0.02, dark, 8).translateX(s * 0.012).translateY(SPOUT_Y + 0.01).translateZ(0.07));
  // The steam wand, and the bean hopper on top.
  const wand = cyl(0.006, 0.006, 0.17, steel, 8);
  wand.position.set(0.18, TOP + 0.25, 0.1);
  wand.rotation.z = 0.12;
  body.add(wand);
  body.add(sphere(0.016, black, 10).translateX(0.18).translateY(TOP + 0.34).translateZ(0.12));
  body.add(cyl(0.07, 0.045, 0.12, '#6b4426', 18).translateX(-0.1).translateY(TOP + 0.5).translateZ(-0.06));
  body.add(cyl(0.074, 0.074, 0.02, black, 18).translateX(-0.1).translateY(TOP + 0.57).translateZ(-0.06));
  // The coffee running from the spouts into the mug.
  const stream = mesh(new THREE.CylinderGeometry(0.004, 0.005, 1, 6).translate(0, -0.5, 0), toon(COFFEE), { cast: false });
  stream.position.set(0, SPOUT_Y, 0.07);
  stream.visible = false;
  machine.add(stream);
  // Round the back of it only: a mug on the drip tray stays clickable.
  const back = reach(0.52, 0.66, 0.24, TOP + 0.31);
  back.position.z = -0.08;
  machine.add(back);
  tag(machine, 'machine');

  // The mugs ----------------------------------------------------------------------
  const mugGeometry = new THREE.LatheGeometry(
    [[0, 0], [MUG.r * 0.85, 0], [MUG.r, 0.008], [MUG.r, MUG.h], [MUG.r - 0.005, MUG.h], [MUG.r - 0.005, MUG.floor], [0, MUG.floor]].map(([x, y]) => new THREE.Vector2(x, y)),
    20,
  );
  const earGeometry = new THREE.TorusGeometry(0.024, 0.007, 6, 14, Math.PI);
  const coffeeGeometry = new THREE.CylinderGeometry(MUG.r - 0.005, MUG.r - 0.006, 1, 18).translate(0, 0.5, 0);
  const mugs = MUGS.map(({ color, at, yaw }, i) => {
    const group = new THREE.Group();
    const home = new THREE.Vector3(at[0], TOP, at[1]);
    group.position.copy(home);
    const tilt = new THREE.Group();
    group.add(tilt);
    const cup = new THREE.Group();
    cup.rotation.y = yaw;
    tilt.add(cup);
    const pot = mesh(mugGeometry, toon(color));
    cup.add(pot);
    const ear = mesh(earGeometry, toon(color));
    ear.rotation.z = -Math.PI / 2;
    ear.position.set(MUG.r, MUG.h / 2, 0);
    cup.add(ear);
    const coffee = mesh(coffeeGeometry, toon(COFFEE), { cast: false });
    coffee.position.y = MUG.floor;
    coffee.visible = false;
    cup.add(coffee);
    // Only on its spot: in your hand it would cover what's behind it, and on
    // the drip tray the front of the machine.
    const grip = reach(0.12, 0.14, 0.12);
    group.add(grip);
    tag(group, 'mug', i);
    const puffs = steam(MUG.h);
    group.add(puffs);
    g.add(group);
    return { group, tilt, cup, coffee, grip, puffs, casters: [pot, ear], home, yaw, fill: 0, state: 'home', t: 0 };
  });

  // The kombucha keg, its tap and a glass -------------------------------------
  const keg = new THREE.Group();
  keg.position.x = KEG.x;
  g.add(keg);
  keg.add(cyl(0.18, 0.18, 0.5, '#8b939c', 18).translateY(1.2));
  keg.add(cyl(0.19, 0.19, 0.05, '#5d646e', 18).translateY(1.46));
  keg.add(box(0.2, 0.08, 0.02, glow('#ffd166'), 0, 1.33, 0.18));
  const shank = cyl(0.011, 0.011, 0.07, steel, 10);
  shank.rotation.x = Math.PI / 2;
  shank.position.set(0, KEG.tapY, 0.2);
  keg.add(shank);
  keg.add(cyl(0.015, 0.012, 0.055, steel, 12).translateY(KEG.tapY - 0.01).translateZ(KEG.tapZ));
  const lever = new THREE.Group();
  lever.position.set(0, KEG.tapY + 0.018, KEG.tapZ);
  lever.add(cyl(0.011, 0.007, 0.085, black, 10).translateY(0.043));
  lever.add(sphere(0.012, black, 10).translateY(0.088));
  keg.add(lever);
  const tapStream = mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6).translate(0, -0.5, 0), glow(KOMBUCHA), { cast: false });
  tapStream.position.set(0, KEG.tapY - 0.04, KEG.tapZ);
  tapStream.visible = false;
  keg.add(tapStream);
  keg.add(reach(0.4, 0.56, 0.48, 1.2));
  tag(keg, 'tap');

  const glass = new THREE.Group();
  glass.position.set(GLASS.at[0], TOP, GLASS.at[1]);
  const glassTilt = new THREE.Group();
  glass.add(glassTilt);
  glassTilt.add(mesh(new THREE.LatheGeometry(
    [[0, 0], [GLASS.r * 0.8, 0], [GLASS.r * 0.85, 0.012], [GLASS.r, GLASS.h], [GLASS.r - 0.003, GLASS.h], [GLASS.r * 0.82, 0.014], [0, 0.014]].map(([x, y]) => new THREE.Vector2(x, y)),
    18,
  ), ownToon('#dff3f6', { transparent: true, opacity: 0.45, depthWrite: false }), { cast: false }));
  const drink = mesh(new THREE.CylinderGeometry(GLASS.r - 0.004, GLASS.r * 0.8, 1, 16).translate(0, 0.5, 0), ownToon(KOMBUCHA, { transparent: true, opacity: 0.85 }), { cast: false });
  drink.position.y = 0.014;
  drink.visible = false;
  glassTilt.add(drink);
  const bubbles = [0, 1, 2, 3].map((i) => {
    const b = noInk(sphere(0.0035, glow('#fff3c9'), 6, { cast: false }));
    b.position.set(Math.cos(i * 2.1) * 0.012, 0, Math.sin(i * 2.1) * 0.012);
    glassTilt.add(b);
    return b;
  });
  glass.add(reach(0.09, 0.14, 0.09));
  tag(glass, 'glass');
  g.add(glass);
  const kombucha = { fill: 0, state: 'empty', t: 0 };

  // The fruit bowl -----------------------------------------------------------------
  const bowl = new THREE.Group();
  bowl.position.set(BOWL.x, 0, BOWL.z);
  g.add(bowl);
  bowl.add(cyl(0.16, 0.1, 0.08, '#e8e1d2', 16).translateY(0.99));
  const fruits = FRUITS.map(({ color, at, stem, scale }, i) => {
    const f = new THREE.Group();
    const base = new THREE.Vector3(at[0], 1.06, at[1]);
    f.position.copy(base);
    const ball = sphere(0.045, color, 10);
    if (scale) ball.scale.set(...scale);
    f.add(ball);
    if (stem) f.add(cyl(0.003, 0.004, 0.025, '#5a3d2b', 6).translateY(0.05));
    f.add(reach(0.1, 0.1, 0.1, 0));
    tag(f, 'fruit', i);
    bowl.add(f);
    return { group: f, base, state: 'bowl', t: 0, spin: i % 2 ? 1 : -1 };
  });

  // Doing things -------------------------------------------------------------------
  const brew = { state: 'idle', mug: null, t: 0, buzz: 0 };
  let nudge = 0;

  const held = () => mugs.find((m) => m.state === 'held');
  const putBack = (mug) => { mug.state = 'home'; };

  function use(part, index) {
    if (part === 'machine') {
      const mug = held();
      if (brew.state === 'ready') drinkUp(mugs[brew.mug]);
      // A mug in place: now it makes the coffee.
      else if (brew.state === 'placed') Object.assign(brew, { state: 'grind', t: 0 });
      else if (brew.state !== 'idle') return;
      else if (!mug) nudge = 0.4;
      else {
        mug.state = 'machine';
        Object.assign(brew, { state: 'placed', mug: mugs.indexOf(mug), t: 0 });
      }
    } else if (part === 'mug') {
      const mug = mugs[index];
      if (mug.state === 'home') {
        const other = held();
        if (other) putBack(other);
        mug.state = 'held';
      } else if (mug.state === 'held') putBack(mug);
      else if (mug.state === 'machine' && brew.state === 'ready') drinkUp(mug);
      else if (mug.state === 'machine' && brew.state === 'placed') {
        // Changed your mind: back in your hand.
        const other = held();
        if (other) putBack(other);
        mug.state = 'held';
        Object.assign(brew, { state: 'idle', mug: null });
      } else if (mug.state === 'machine') mug.wiggle = 0.5;
    } else if (part === 'counter') {
      const mug = held();
      if (mug) putBack(mug);
    } else if (part === 'tap' || part === 'glass') {
      if (kombucha.state === 'empty') Object.assign(kombucha, { state: 'pour', t: 0 });
      else if (kombucha.state === 'full') Object.assign(kombucha, { state: 'sip', t: 0 });
    } else if (part === 'fruit') {
      const fruit = fruits[index];
      if (fruit?.state !== 'bowl') return;
      fruit.state = 'eat';
      fruit.t = 0;
    }
  }

  function drinkUp(mug) {
    const other = held();
    if (other) putBack(other);
    Object.assign(brew, { state: 'idle', mug: null });
    mug.state = 'drink';
    mug.t = 0;
  }

  function label(part, index) {
    if (part === 'machine') return `Espresso machine${{ placed: ' · mug in place', grind: ' · grinding', pour: ' · brewing', ready: ' · coffee ready' }[brew.state] || ''}`;
    if (part === 'mug') {
      const mug = mugs[index];
      if (mug.state === 'held') return 'Mug · in hand';
      if (mug.state === 'machine') return { placed: 'Mug · on the machine', ready: 'Mug · coffee ready' }[brew.state] || 'Mug · brewing';
      return 'Mug';
    }
    if (part === 'tap' || part === 'glass') return `Kombucha${{ pour: ' · pouring', full: ' · glass poured', sip: ' · drinking' }[kombucha.state] || ''}`;
    if (part === 'fruit') return FRUITS[index]?.name || '';
    // Only somewhere to put a mug down: with nothing in hand it's just furniture.
    if (part === 'counter') return held() ? 'Coffee bar' : '';
    return '';
  }

  // Scratch space for placing mugs in front of the camera.
  const where = new THREE.Vector3();
  const facing = new THREE.Quaternion();
  const barTurn = new THREE.Quaternion();
  const ahead = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const cameraTurn = new THREE.Quaternion();

  /** Where in front of `camera` a mug goes (`spot`: HAND or LIPS, `rise` lifting it), in the bar's space, facing you. */
  function inView(camera, spot, rise = 0) {
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = MUG.h / 2 / half / spot.size;
    camera.getWorldDirection(ahead);
    side.setFromMatrixColumn(camera.matrixWorld, 0);
    lift.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.getWorldPosition(where).addScaledVector(ahead, d)
      .addScaledVector(side, spot.across * half * camera.aspect * d)
      .addScaledVector(lift, (spot.up + rise) * half * d - MUG.h / 2);
    g.worldToLocal(where);
    g.getWorldQuaternion(barTurn).invert();
    facing.copy(barTurn).multiply(camera.getWorldQuaternion(cameraTurn));
  }

  function update(dt, t, camera) {
    // The machine: take the mug, grind, then pour into it.
    if (brew.state === 'grind' || brew.state === 'pour') brew.t += dt;
    if (brew.state === 'grind' && brew.t > BREW.grind) {
      brew.state = 'pour';
      brew.t = 0;
    }
    const filling = brew.state === 'pour' ? mugs[brew.mug] : null;
    if (filling) {
      filling.fill = Math.min(1, brew.t / BREW.pour);
      if (filling.fill >= 1) brew.state = 'ready';
    }
    const buzz = brew.state === 'grind' ? 1 : brew.state === 'pour' ? 0.3 : 0;
    nudge = Math.max(0, nudge - dt);
    brew.buzz = THREE.MathUtils.damp(brew.buzz, buzz + nudge * 2, 12, dt);
    body.position.x = Math.sin(t * 95) * 0.003 * brew.buzz;
    body.position.y = Math.abs(Math.sin(t * 70)) * 0.0015 * brew.buzz;
    brewLight.material = brew.state === 'idle' || brew.state === 'placed' ? brewOff : brew.state === 'ready' && Math.sin(t * 6) < 0 ? brewOff : brewLit;
    stream.visible = !!filling && filling.fill < 0.98;
    if (stream.visible) stream.scale.y = SPOUT_Y - (UNDER_SPOUT.y + MUG.floor + filling.fill * (MUG.h - MUG.floor - 0.012));

    camera.updateMatrixWorld();
    for (const mug of mugs) {
      // Where it's headed: its spot, the drip tray, your hand or your lips.
      let tilt = 0;
      let follow = 9;
      if (mug.state === 'home') {
        where.copy(mug.home);
        facing.identity();
      } else if (mug.state === 'machine') {
        where.copy(UNDER_SPOUT);
        facing.identity();
      } else if (mug.state === 'held') {
        inView(camera, HAND);
        follow = 14;
      } else {
        // Up to your lips, tipped towards you, drained, and back down in your hand.
        mug.t += dt;
        const k = mug.t;
        const up = THREE.MathUtils.smoothstep(k, 0, 0.7) - THREE.MathUtils.smoothstep(k, 2, DRINK);
        inView(camera, LIPS, up * 0.5);
        tilt = (THREE.MathUtils.smoothstep(k, 0.5, 1.1) - THREE.MathUtils.smoothstep(k, 1.8, 2.3)) * 1.4;
        if (k > 0.9) mug.fill = Math.max(0, mug.fill - dt / 0.9);
        follow = 12;
        if (k >= DRINK) {
          mug.fill = 0;
          // Picked up another one meanwhile: this one goes back to its spot.
          mug.state = held() ? 'home' : 'held';
        }
      }
      const ease = 1 - Math.exp(-follow * dt);
      mug.group.position.lerp(where, ease);
      mug.group.quaternion.slerp(facing, ease);
      mug.tilt.rotation.x = THREE.MathUtils.damp(mug.tilt.rotation.x, tilt, 10, dt);
      // On the counter it stands as it was put down; off it, its handle's to your right.
      const away = mug.state === 'held' || mug.state === 'drink';
      mug.cup.rotation.y = THREE.MathUtils.damp(mug.cup.rotation.y, away ? -0.5 : mug.state === 'machine' ? -0.4 : mug.yaw, 8, dt);
      mug.grip.visible = mug.state === 'home';
      if (away !== mug.away) {
        mug.away = away;
        for (const o of mug.casters) o.castShadow = !away;
      }
      // On its way to your lips it fills the middle of the view: aim through it.
      const drinking = mug.state === 'drink';
      if (drinking !== mug.drinking) {
        mug.drinking = drinking;
        mug.group.traverse((o) => { if (o.isMesh) o.raycast = drinking ? noRaycast : THREE.Mesh.prototype.raycast; });
      }
      if (mug.wiggle) {
        mug.wiggle = Math.max(0, mug.wiggle - dt);
        mug.tilt.rotation.z = Math.sin(mug.wiggle * 40) * 0.12 * mug.wiggle * 2;
      }
      mug.coffee.visible = mug.fill > 0.01;
      mug.coffee.scale.y = Math.max(0.001, mug.fill * (MUG.h - MUG.floor - 0.012));
      mug.puffs.userData.puff(t, mug.state === 'machine' ? mug.fill : 0);
    }

    // The kombucha: pull the tap, the glass fills; then you drink it.
    kombucha.t += dt;
    if (kombucha.state === 'pour') {
      kombucha.fill = Math.min(1, kombucha.t / POUR_GLASS);
      if (kombucha.fill >= 1) kombucha.state = 'full';
    } else if (kombucha.state === 'sip') {
      const k = kombucha.t / SIP;
      const up = Math.sin(Math.min(1, k) * Math.PI);
      glass.position.set(GLASS.at[0], TOP + up * 0.22, GLASS.at[1] + up * 0.1);
      glassTilt.rotation.x = Math.max(0, up - 0.3) * 1.2;
      if (k > 0.35) kombucha.fill = Math.max(0, kombucha.fill - dt / (SIP * 0.35));
      if (k >= 1) {
        Object.assign(kombucha, { state: 'empty', fill: 0 });
        glass.position.set(GLASS.at[0], TOP, GLASS.at[1]);
        glassTilt.rotation.x = 0;
      }
    }
    const pulling = kombucha.state === 'pour' && kombucha.fill < 0.97;
    lever.rotation.x = THREE.MathUtils.damp(lever.rotation.x, pulling ? 0.7 : 0, 14, dt);
    tapStream.visible = pulling;
    const level = kombucha.fill * (GLASS.h - 0.024);
    if (pulling) tapStream.scale.y = KEG.tapY - 0.04 - (TOP + 0.014 + level);
    drink.visible = kombucha.fill > 0.01;
    drink.scale.y = Math.max(0.001, level);
    bubbles.forEach((b, i) => {
      b.visible = kombucha.fill > 0.25 && kombucha.state !== 'sip';
      b.position.y = 0.02 + (((t * 0.6 + i * 0.27) % 1) * (level - 0.008));
    });

    // The fruit: eaten in a hop and a spin; it grows back in the bowl later.
    for (const f of fruits) {
      f.t += dt;
      if (f.state === 'eat') {
        const k = Math.min(1, f.t / EAT);
        f.group.position.set(f.base.x, f.base.y + Math.sin(k * Math.PI) * 0.18, f.base.z);
        f.group.rotation.y = k * 7 * f.spin;
        f.group.scale.setScalar(1 - k * k);
        if (k >= 1) {
          Object.assign(f, { state: 'gone', t: 0 });
          f.group.visible = false;
        }
      } else if (f.state === 'gone' && f.t > REGROW) {
        Object.assign(f, { state: 'grow', t: 0 });
        f.group.position.copy(f.base);
        f.group.rotation.y = 0;
        f.group.visible = true;
      } else if (f.state === 'grow') {
        const k = Math.min(1, f.t / 0.8);
        f.group.scale.setScalar(Math.max(0.001, elasticOut(k)));
        if (k >= 1) f.state = 'bowl';
      }
    }
  }

  return { group: g, use, label, update };
}

function noRaycast() {}

/** Soft white, fading out from the middle. */
let puffTexture = null;
function softPuff() {
  if (puffTexture) return puffTexture;
  puffTexture = glowTexture([[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  // One for every copy of the room: never disposed with one.
  puffTexture.userData.shared = true;
  return puffTexture;
}

/** Wisps of steam rising from `y`: `userData.puff(t, strength)` moves them. */
function steam(y) {
  const g = new THREE.Group();
  const puffs = [0, 1, 2, 3, 4].map((i) => {
    const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: softPuff(), transparent: true, opacity: 0, depthWrite: false }));
    p.userData.phase = i / 5;
    g.add(p);
    return p;
  });
  noInk(g);
  g.userData.puff = (t, strength) => {
    g.visible = strength > 0.01;
    if (!g.visible) return;
    for (const p of puffs) {
      const k = (t * 0.45 + p.userData.phase) % 1;
      const ph = p.userData.phase * 9;
      p.position.set(Math.sin(t * 2 + ph) * 0.01 * (1 + k * 2), y + k * 0.2, Math.cos(t * 1.6 + ph) * 0.008);
      p.scale.setScalar(0.03 + k * 0.06);
      p.material.opacity = Math.sin(k * Math.PI) * 0.65 * Math.min(1, strength * 1.5);
    }
  };
  return g;
}
