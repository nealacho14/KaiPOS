import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// The server has no network state to report, and rendering "offline" during
// hydration would flash a banner on every load.
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Tracks browser connectivity.
 *
 * `navigator.onLine` only reports whether the device has *a* network
 * interface — it cannot tell a captive portal or a dead API from a healthy
 * connection. That is enough for the one thing it drives here: telling a
 * cashier that the catalog on screen may be stale and that an order cannot be
 * submitted right now.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
