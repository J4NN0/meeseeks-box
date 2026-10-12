// The full-screen swirl for hopping between universes. Diving in, it grows
// out of the battery you clicked; climbing out, it shrinks back into the
// battery you came out of. In between, the scene is swapped underneath.
// Shrinking into the battery, or through the portal, it's just a plain
// wash of that colour (`flash`), with no words: the camera does the telling.

const IN_MS = 520;
const OUT_MS = 650;
const FLASH_MS = 260;

export class Wipe {
  constructor(el) {
    this.el = el;
    this.name = el.querySelector('.name');
    this.sub = el.querySelector('.sub');
  }

  /**
   * Covers the screen; `from` is the point it grows out of, or it fades in.
   * `flash` is a quick, wordless flash of that colour instead of the swirl.
   */
  async cover({ name = '', sub = '', from, flash }) {
    this.name.textContent = name;
    this.sub.textContent = sub;
    this.el.classList.toggle('flash', !!flash);
    this.el.style.setProperty('--flash', flash || '');
    this.el.hidden = false;
    const r = Math.hypot(innerWidth, innerHeight);
    const frames = from
      ? [{ clipPath: `circle(0px at ${from.x}px ${from.y}px)` }, { clipPath: `circle(${r}px at ${from.x}px ${from.y}px)` }]
      : [{ opacity: 0 }, { opacity: 1 }];
    await this.play(frames, { duration: flash ? FLASH_MS : from ? IN_MS : IN_MS * 0.6, easing: 'cubic-bezier(0.6, 0, 0.9, 0.4)' });
  }

  /** Uncovers it; `to` is the point it shrinks into, or it fades out. */
  async reveal({ to, duration = OUT_MS }) {
    const r = Math.hypot(innerWidth, innerHeight);
    const frames = to
      ? [{ clipPath: `circle(${r}px at ${to.x}px ${to.y}px)` }, { clipPath: `circle(0px at ${to.x}px ${to.y}px)` }]
      : [{ opacity: 1 }, { opacity: 0 }];
    await this.play(frames, { duration, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)' });
    this.el.hidden = true;
    this.el.classList.remove('flash');
    this.el.style.clipPath = '';
    this.el.style.opacity = '';
  }

  async play(frames, options) {
    const anim = this.el.animate(frames, { ...options, fill: 'forwards' });
    try {
      await anim.finished;
      anim.commitStyles();
    } catch {
      // Cancelled (the tab went away): just land on the end state.
    }
    anim.cancel();
  }
}
