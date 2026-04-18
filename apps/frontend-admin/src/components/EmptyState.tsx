import { Box, Stack, Typography } from '@kaipos/ui';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <Stack
      alignItems="center"
      spacing={2}
      sx={{
        py: 8,
        px: 3,
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      {icon && (
        <Box
          aria-hidden
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            color: 'text.secondary',
          }}
        >
          {icon}
        </Box>
      )}
      <Box>
        <Typography variant="h6" component="p" sx={{ color: 'text.primary', fontWeight: 600 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 420 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && <Box>{action}</Box>}
    </Stack>
  );
}
