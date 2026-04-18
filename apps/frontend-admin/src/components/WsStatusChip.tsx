import { Box, Chip } from '@kaipos/ui';
import type { WSClientStatus } from '../lib/ws-client.js';

export type WsStatusChipStatus = WSClientStatus | 'idle';

interface WsStatusConfig {
  label: string;
  color: 'success' | 'warning' | 'default';
  dot: string;
}

const STATUS_CONFIG: Record<WsStatusChipStatus, WsStatusConfig> = {
  open: { label: 'Conectado', color: 'success', dot: 'success.main' },
  connecting: { label: 'Conectando…', color: 'warning', dot: 'warning.main' },
  reconnecting: { label: 'Reconectando…', color: 'warning', dot: 'warning.main' },
  closed: { label: 'Desconectado', color: 'default', dot: 'text.disabled' },
  idle: { label: 'Inactivo', color: 'default', dot: 'text.disabled' },
};

export interface WsStatusChipProps {
  status: WsStatusChipStatus;
}

export function WsStatusChip({ status }: WsStatusChipProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  return (
    <Chip
      size="small"
      color={config.color}
      variant={config.color === 'default' ? 'outlined' : 'filled'}
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
