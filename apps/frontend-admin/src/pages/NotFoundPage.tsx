import { AlertCircle, Button } from '@kaipos/ui';
import { Link as RouterLink } from 'react-router-dom';
import { EmptyState } from '../components/index.js';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<AlertCircle size={28} aria-hidden />}
      title="No encontramos esa página."
      subtitle="Es posible que el enlace esté desactualizado o que la sección haya cambiado de ubicación."
      action={
        <Button variant="contained" component={RouterLink} to="/dashboard">
          Volver al dashboard
        </Button>
      }
    />
  );
}
