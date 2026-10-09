import * as THREE from 'three';

// Flat, cel-shaded materials. The black ink lines come from the outline
// post-process, so materials only need to provide the flat colour bands.

export const PALETTE = {
  ink: '#1c1714',
  floor: '#a9ab9b',
  wall: '#b9c7bd',
  wallDark: '#95a69b',
  wallTrim: '#6f7f76',
  wood: '#b98552',
  woodDark: '#8a5a34',
  metal: '#a3aab3',
  metalDark: '#6d747e',
  cream: '#ece3c9',
  portal: '#97ce4c',
  portalCore: '#e8ffa8',
  meeseeks: '#6ec6ee',
  claude: '#e0875f',
  codex: '#6ec6ee',
  plant: '#5fa35a',
  plantDark: '#3f7a41',
  red: '#d9534f',
  yellow: '#f2c94c',
  pink: '#ff5fa2',
};

let gradient;
function gradientMap() {
  if (gradient) return gradient;
  // Three tones: core shadow, soft shadow, lit. Close together keeps it flat.
  const data = new Uint8Array([120, 190, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const shared = new Map();
const sharedSet = new WeakSet();

/** Materials from toon()/glow() are used by every office: never dispose them. */
export const isShared = (material) => sharedSet.has(material);

/** Shared toon material for static props. Do not mutate the result. */
export function toon(color, opts = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${JSON.stringify(opts)}`;
  let m = shared.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
    shared.set(key, m);
    sharedSet.add(m);
  }
  return m;
}

/** Unshared toon material, for things that animate colour (characters). */
export function ownToon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...opts });
}

/** Unlit material for screens, neon and glowing bits. */
export function glow(color, opts = {}) {
  const key = `glow|${new THREE.Color(color).getHexString()}|${JSON.stringify(opts)}`;
  let m = shared.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...opts });
    shared.set(key, m);
    sharedSet.add(m);
  }
  return m;
}

/** Layer 1 objects render in colour but skip the ink-line pass. */
export const NO_INK_LAYER = 1;
export function noInk(obj) {
  obj.traverse((o) => o.layers.set(NO_INK_LAYER));
  return obj;
}

export function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Box helper: size and position in one call. */
export function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'object' && color.isMaterial ? color : toon(color), opts);
  m.position.set(x, y, z);
  return m;
}

export function cyl(rt, rb, h, color, seg = 20, opts) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'object' && color.isMaterial ? color : toon(color), opts);
}

export function sphere(r, color, seg = 20, opts) {
  return mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), typeof color === 'object' && color.isMaterial ? color : toon(color), opts);
}

/** Deterministic PRNG so props and per-agent looks are stable across reloads. */
export function rng(seed = 1) {
  let s = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
