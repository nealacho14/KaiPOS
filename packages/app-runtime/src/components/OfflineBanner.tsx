import { Alert } from '@kaipos/ui';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

/**
 * Slim banner shown while the browser reports no connection.
 *
 * The offline story is deliberately read-only: the service worker precaches the
 * app shell and keeps the last catalog, so the POS still opens and a cashier can
 * look things up — but nothing can be submitted, because orders are not queued.
 * Saying so plainly is the whole point of this banner; silently failing writes
 * would be worse than not working at all.
 *
 * Mounted inside each app's layout rather than at the root so it participates
 * in the POS shell's `100dvh` flex column. The auth pages sit outside both
 * layouts and so do not show it — an offline login already fails with its own
 * visible error.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <Alert
      severity="warning"
      square
      icon={false}
      data-testid="offline-banner"
      sx={{ py: 0.5, flexShrink: 0 }}
    >
      Sin conexión. Puedes consultar el catálogo, pero no cobrar.
    </Alert>
  );
}
