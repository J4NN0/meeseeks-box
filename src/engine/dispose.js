import { isShared } from './toon.js';

/**
 * Frees what a scene holds on the GPU: geometries, its own materials and
 * their textures, shadow maps, and the DOM of its floating labels. Shared
 * materials (toon(), glow()), geometries and textures marked
 * `userData.shared` and the textures in `keep` stay, because other scenes
 * still use them.
 */
export function disposeScene(scene, { keep = new Set() } = {}) {
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) geometries.add(o.geometry);
    for (const m of [o.material].flat()) if (m && !isShared(m)) materials.add(m);
    if (o.isLight) o.dispose();
    if (o.isCSS2DObject) o.element.remove();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    if (m.map && !keep.has(m.map) && !m.map.userData.shared) m.map.dispose();
    m.dispose();
  }
  scene.clear();
}
