import { useAuth } from '@kaipos/app-runtime';
import { Button, EmptyState, Lock } from '@kaipos/ui';

// Terminal page for roles with no reachable surface in the admin SPA (today
// only `kitchen`). It exists so `resolveHomePath` always has somewhere real to
// send a user — a guard fallback pointing at a route the role cannot see would
// bounce forever.
export function NoAccessPage() {
  const { logout } = useAuth();

  return (
    <EmptyState
      icon={<Lock size={28} aria-hidden />}
      title="Tu rol no tiene acceso al panel de administración."
      subtitle="Si crees que se trata de un error, pide a un administrador que revise los permisos de tu cuenta."
      action={
        <Button variant="contained" onClick={() => void logout()}>
          Cerrar sesión
        </Button>
      }
    />
  );
}
