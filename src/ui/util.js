// Helpers shared by the HUD's panels.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function shellQuote(s) {
  return /^[\w./-]+$/.test(s || '') ? s : `'${String(s).replace(/'/g, "'\\''")}'`;
}

/** Copies a `data-copy` button's text, saying so on the button for a moment. */
export async function copyFrom(btn) {
  // Kept from the first click, so a second one doesn't take "Copied!" as the label.
  btn.dataset.label ||= btn.textContent;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.textContent = 'Copied!';
  } catch {
    btn.textContent = 'Copy failed';
  }
  clearTimeout(btn.copyTimer);
  btn.copyTimer = setTimeout(() => { if (btn.isConnected) btn.textContent = btn.dataset.label; }, 1500);
}
