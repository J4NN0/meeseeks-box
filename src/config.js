// Settings from the URL query string (see "Knobs" in the README).

const params = new URLSearchParams(location.search);

function minutes(name, fallback) {
  const n = Number(params.get(name));
  return params.has(name) && Number.isFinite(n) && n > 0 ? n : fallback;
}

export const CONFIG = {
  /** ?noink turns off the outline pass. */
  ink: !params.has('noink'),
  /** ?mascots=meeseeks|mascots|chaos overrides the saved mascot mode. */
  mascots: params.get('mascots'),
  /** ?stress=N: minutes of turn time before "Existence is pain". */
  stressAfterMs: minutes('stress', 20) * 60_000,
};
