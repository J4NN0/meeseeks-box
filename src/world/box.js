import * as THREE from 'three';
import { box, cyl, mesh, noInk } from '../engine/toon.js';
import { labelTexture } from './screens.js';

// The Meeseeks Box itself: press the button, get a Meeseeks. Every new agent
// session "presses" it, and so can you: click it and out comes one that asks
// what it's for (see server/meeseeks.js).

export function createMeeseeksBox() {
  const group = new THREE.Group();

  // Little round side table it sits on.
  group.add(cyl(0.42, 0.42, 0.05, '#d9d2c3', 28).translateY(0.62));
  group.add(cyl(0.05, 0.07, 0.6, '#3a3f47', 12).translateY(0.31));
  group.add(cyl(0.26, 0.3, 0.03, '#3a3f47', 20).translateY(0.015));

  const boxGroup = new THREE.Group();
  boxGroup.position.y = 0.645;
  group.add(boxGroup);
  boxGroup.add(box(0.48, 0.34, 0.48, '#3f8fd6', 0, 0.17, 0));
  boxGroup.add(box(0.5, 0.05, 0.5, '#2c6aa8', 0, 0.345, 0));
  boxGroup.add(cyl(0.11, 0.12, 0.04, '#d9dde2', 24).translateY(0.39));
  const button = cyl(0.085, 0.09, 0.06, '#f4f6f8', 24);
  button.position.y = 0.43;
  boxGroup.add(button);

  const label = mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ map: labelTexture('MR. MEESEEKS', { bg: '#3f8fd6', fg: '#f4f6f8', w: 320, h: 80, font: '36px "Luckiest Guy", system-ui' }) }), { cast: false });
  label.position.set(0, 0.2, 0.242);
  boxGroup.add(label);

  // A bit bigger than the box, so it's easy to hit.
  const reach = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshBasicMaterial({ visible: false }));
  reach.position.y = 0.2;
  boxGroup.add(noInk(reach));
  group.traverse((o) => { if (o.isMesh) o.userData.meeseeksBox = true; });

  let press = 0;
  let shake = 0;
  return {
    group,
    press() {
      press = 1;
      shake = 0.6;
    },
    update(dt, t) {
      press = Math.max(0, press - dt * 3);
      shake = Math.max(0, shake - dt);
      button.position.y = 0.43 - Math.sin(press * Math.PI) * 0.035;
      boxGroup.rotation.z = Math.sin(t * 40) * 0.05 * shake;
      boxGroup.position.y = 0.645 + Math.abs(Math.sin(t * 25)) * 0.03 * shake;
    },
  };
}
