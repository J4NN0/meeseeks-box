// URL controls are available only when explicitly enabled.
const params = new URLSearchParams(location.search);
export const debugParams = params.get('debug') === 'true' ? params : new URLSearchParams();

if (debugParams !== params && location.search) {
  history.replaceState(history.state, '', location.pathname + location.hash);
}
