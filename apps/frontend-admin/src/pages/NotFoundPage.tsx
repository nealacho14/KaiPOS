import { resolveHomePath, useAuth } from '@kaipos/app-runtime';
import { AlertCircle, Button, EmptyState } from '@kaipos/ui';
import { Link as RouterLink } from 'react-router-dom';

export function NotFoundPage() {
  const { user } = useAuth();
  // Not every role can reach /dashboard, so send them to their own home.
  const home = user ? resolveHomePath(user.role) : '/dashboard';

  return (
    <EmptyState
      icon={<AlertCircle size={28} aria-hidden />}
      title="No encontramos esa página."
      subtitle="Es posible que el enlace esté desactualizado o que la sección haya cambiado de ubicación."
      action={
        <Button variant="contained" component={RouterLink} to={home}>
          Volver al inicio
        </Button>
      }
    />
  );
}
