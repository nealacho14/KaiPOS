import { Box } from '@kaipos/ui';
import { EmptyState } from '../components/EmptyState.js';

export function NoBranchPage() {
  return (
    <Box sx={{ p: { xs: 2, md: 4 }, height: '100%', display: 'flex', alignItems: 'center' }}>
      <EmptyState
        title="Sin sucursales asignadas"
        subtitle="Pídele a tu administrador que te asigne una sucursal."
      />
    </Box>
  );
}
