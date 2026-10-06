// Picks the folder a Meeseeks from the box works in: type a path, click one
// of the folders you work in, or browse your folders (GET /api/folders).

import { get } from '../data/api.js';
import { esc } from './util.js';

const base = (p) => p.replace(/\/+$/, '').split('/').pop() || p;

export class FolderPicker {
  /** `known` is the folders to offer, most likely first. */
  constructor(el, { value, known }) {
    el.innerHTML = `
      <div class="folder">
        <span>📁</span>
        <input type="text" spellcheck="false" autocomplete="off" placeholder="~/your/project" aria-label="The folder it works in">
        <button type="button" class="browse" aria-expanded="false">Browse</button>
      </div>
      <div class="known"></div>
      <div class="browser" hidden>
        <div class="where"><button type="button" class="up" aria-label="Up one folder">⬆</button><code></code></div>
        <ul></ul>
      </div>`;
    this.input = el.querySelector('input');
    this.knownEl = el.querySelector('.known');
    this.browser = el.querySelector('.browser');
    this.whereEl = el.querySelector('.where code');
    this.listEl = el.querySelector('.browser ul');
    this.browseBtn = el.querySelector('.browse');
    this.parent = '';
    this.input.value = value;
    requestAnimationFrame(() => { this.input.scrollLeft = this.input.scrollWidth; });
    this.knownEl.innerHTML = known.map((p) => `<button type="button" data-path="${esc(p)}" title="${esc(p)}">${esc(base(p))}</button>`).join('');
    this.knownEl.hidden = !known.length;
    this.mark();

    this.input.addEventListener('input', () => this.mark());
    this.knownEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-path]');
      if (!b) return;
      this.set(b.dataset.path);
      if (!this.browser.hidden) this.open(b.dataset.path);
    });
    this.browseBtn.addEventListener('click', () => (this.browser.hidden ? this.open(this.value || '~') : this.close()));
    el.querySelector('.up').addEventListener('click', () => this.parent && this.open(this.parent, true));
    this.listEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-path]');
      if (b) this.open(b.dataset.path, true);
    });
  }

  get value() { return this.input.value.trim(); }

  set(path) {
    this.input.value = path;
    // The end of a long path is the part that tells folders apart.
    this.input.scrollLeft = this.input.scrollWidth;
    this.mark();
  }

  /** Highlights the known folder you're on. */
  mark() {
    for (const b of this.knownEl.children) b.classList.toggle('on', b.dataset.path === this.value);
  }

  /** Shows the folders in `path`; `pick` also makes it the one it works in. */
  async open(path, pick = false) {
    this.browser.hidden = false;
    this.browseBtn.setAttribute('aria-expanded', 'true');
    try {
      const data = await get(`/api/folders?path=${encodeURIComponent(path)}`);
      this.parent = data.parent;
      // Clipped from the left (rtl), so the end of the path shows; the marks keep its slashes in place.
      this.whereEl.textContent = `\u200e${data.path}\u200e`;
      this.listEl.innerHTML = data.folders.map((name) => `<li><button type="button" data-path="${esc(`${data.path.replace(/\/$/, '')}/${name}`)}">📁 ${esc(name)}</button></li>`).join('')
        || '<li class="none">No folders in here.</li>';
      this.listEl.scrollTop = 0;
      if (pick) this.set(data.path);
    } catch (e) {
      this.listEl.innerHTML = `<li class="none">${esc(e.message)}</li>`;
    }
  }

  close() {
    this.browser.hidden = true;
    this.browseBtn.setAttribute('aria-expanded', 'false');
  }
}
