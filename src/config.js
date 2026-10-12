// Debug settings from the URL query string.

import { debugParams as params } from './debug.js';

function minutes(name, fallback) {
  const n = Number(params.get(name));
  return params.has(name) && Number.isFinite(n) && n > 0 ? n : fallback;
}

export const CONFIG = {
  /** ?noink turns off the outline pass. */
  ink: !params.has('noink'),
  /** ?stress=N: minutes of turn time before "Existence is pain". */
  stressAfterMs: minutes('stress', 20) * 60_000,
};
