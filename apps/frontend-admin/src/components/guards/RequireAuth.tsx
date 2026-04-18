import { Box, CircularProgress } from '@kaipos/ui';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'idle' || status === 'loading') {
    return (
      <Box
        role="status"
        aria-live="polite"
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
