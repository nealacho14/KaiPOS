import { Box, Chip } from './index.js';

// Mirrors the union used by the app-level WS clients. Kept inline so this
// component can ship from `@kaipos/ui` without dragging an app-runtime import
// in. Keep in sync with `WSClientStatus` in the app runtime.
export type WsStatusChipStatus =
  | 'open'
  | 'connecting'
  | 'reconnecting'
  | 'closed'
  | 'idle'
  | 'failed';

interface WsStatusConfig {
  label: string;
  color: 'success' | 'warning' | 'error' | 'default';
  dot: string;
}

const STATUS_CONFIG: Record<WsStatusChipStatus, WsStatusConfig> = {
  open: { label: 'Conectado', color: 'success', dot: 'success.main' },
  connecting: { label: 'Conectando…', color: 'warning', dot: 'warning.main' },
  reconnecting: { label: 'Reconectando…', color: 'warning', dot: 'warning.main' },
  closed: { label: 'Desconectado', color: 'default', dot: 'text.disabled' },
  idle: { label: 'Inactivo', color: 'default', dot: 'text.disabled' },
  // Terminal: the client exhausted its reconnect attempts (or has no session)
  // and will not retry until an explicit reconnect / page reload.
  failed: { label: 'Sin conexión', color: 'error', dot: 'error.main' },
};

export interface WsStatusChipProps {
  status: WsStatusChipStatus;
  /**
   * Dot-only rendering for dense surfaces (phone header). Still announces
   * the full status text to assistive tech via `aria-label`.
   */
  compact?: boolean;
}

export function WsStatusChip({ status, compact = false }: WsStatusChipProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  // `open` is the only state where the WS round-trip is fully wired. Everything
  // else (connecting/reconnecting/closed/idle) is "not yet active" for the
  // Cypress smoke test, which polls `data-status` until it sees `active`.
  const dataStatus = status === 'open' ? 'active' : 'inactive';

  if (compact) {
    return (
      <Box
        role="status"
        aria-label={config.label}
        data-testid="ws-status"
        data-status={dataStatus}
        sx={{
          width: 24,
          height: 24,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: config.dot,
            display: 'inline-block',
          }}
        />
      </Box>
    );
  }

  return (
    <Chip
      size="small"
      color={config.color}
      variant={config.color === 'default' ? 'outlined' : 'filled'}
      data-testid="ws-status"
      data-status={dataStatus}
      label={
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            component="span"
            aria-hidden
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: config.dot,
              display: 'inline-block',
            }}
          />
          {config.label}
        </Box>
      }
    />
  );
}
