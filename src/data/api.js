// Writes to the box's API carry its key (server/key.js). The server hands it
// to a browser running as you (GET /api/key); where it can't tell, the link
// it prints (`#key=…`) brings it instead. Either way this browser keeps it.

const STORE = 'meeseeks:key';

let key = '';
try { key = localStorage.getItem(STORE) || ''; } catch { /* private mode */ }

function keep(value) {
  key = value;
  try {
    if (value) localStorage.setItem(STORE, value);
    else localStorage.removeItem(STORE);
  } catch { /* kept for this visit only */ }
}

const given = /(?:^#|&)key=([0-9a-f]{64})(?:&|$)/.exec(location.hash)?.[1];
if (given) {
  keep(given);
  // Out of the address bar and history, where it would be copied along.
  history.replaceState(null, '', location.pathname + location.search);
}

let asking = null;

/** The key, asked of the server if this browser doesn't have it yet. */
function ensureKey() {
  if (key) return key;
  asking ||= fetch('/api/key', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : {}))
    .then((data) => {
      if (data.key) keep(data.key);
      return key;
    })
    .catch(() => key)
    .finally(() => { asking = null; });
  return asking;
}

// Ready by the time you first press something. The demo has no server to ask.
if (import.meta.env.MODE !== 'demo') ensureKey();

/** Sends a request with the key; rejects with the server's error. */
async function request(url, init = {}) {
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    const sent = await ensureKey();
    res = await fetch(url, { cache: 'no-store', ...init, headers: { ...init.headers, 'x-meeseeks-key': sent } });
    // A key the server no longer has (its key file was replaced): ask for the new one.
    if (res.status !== 401 || !sent) break;
    keep('');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** GETs a read that needs the key. */
export const get = (url) => request(url);

/** POSTs `body` as JSON. */
export const post = (url, body = {}) => request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
