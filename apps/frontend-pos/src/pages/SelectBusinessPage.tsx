import { Box, Stack } from '@kaipos/ui';
import { BusinessPicker } from '../components/BusinessPicker.js';
import { EmptyState } from '../components/EmptyState.js';

export function SelectBusinessPage() {
  return (
    <Box sx={{ p: { xs: 2, md: 4 }, height: '100%', display: 'flex', alignItems: 'center' }}>
      <Stack spacing={3} alignItems="center" sx={{ width: '100%' }}>
        <EmptyState
          title="Selecciona un negocio para operar el POS"
          subtitle="Elige el negocio que vas a atender y vuelve al catálogo."
        />
        <BusinessPicker />
      </Stack>
    </Box>
  );
}
