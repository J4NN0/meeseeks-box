import * as THREE from 'three';
import { rng } from '../engine/toon.js';
import { Meeseeks } from './meeseeks.js';

// Provider sets the colour family, the session id nudges it so two agents
// from the same provider are still told apart.
const FAMILIES = {
  claude: { h: 0.05, s: 0.8, l: 0.6, spread: 0.03 },
  codex: { h: 0.55, s: 0.75, l: 0.68, spread: 0.04 },
  other: { h: 0.33, s: 0.5, l: 0.62, spread: 0.08 },
};

export function agentColor(provider, seed) {
  const f = FAMILIES[provider] || FAMILIES.other;
  const r = rng(`${seed}:color`);
  return new THREE.Color().setHSL(
    (f.h + (r() - 0.5) * 2 * f.spread + 1) % 1,
    f.s + (r() - 0.5) * 0.12,
    f.l + (r() - 0.5) * 0.08,
  );
}

/** A Meeseeks for a session (or one of its helpers, by `seed`), in its colours. */
export function createMeeseeks({ provider, seed }) {
  return new Meeseeks({ color: agentColor(provider, seed), seed });
}
