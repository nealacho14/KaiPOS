import type { ApiResponse } from '@kaipos/shared';
import { API_VERSION } from '@kaipos/shared';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  ColorSchemeToggle,
  Container,
  KaiPOSLogo,
  Link,
  Stack,
  Typography,
} from '@kaipos/ui';
import { useEffect, useState } from 'react';
import { DebugWebSocket } from './pages/DebugWebSocket.js';

interface HealthData {
  service: string;
  version: string;
  database: string;
  databaseError?: string;
  timestamp: string;
}

function readHashRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash.replace(/^#/, '');
}

export function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<string>(() => readHashRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(readHashRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: ApiResponse<HealthData>) => {
        if (data.success && data.data) {
          setHealth(data.data);
        }
      })
      .catch(() => setError('Could not connect to API'));
  }, []);

  if (route === '/debug/ws') {
    return <DebugWebSocket />;
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" spacing={2} alignItems="center">
          <KaiPOSLogo variant="horizontal" size="md" />
          <Typography variant="overline" color="text.secondary">
            Admin
          </Typography>
        </Stack>
        <ColorSchemeToggle />
      </Stack>

      <Typography
        component="h1"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        KaiPOS Admin
      </Typography>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Version: {API_VERSION}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {health && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body1">API Status: {health.service}</Typography>
            <Chip
              label={health.database}
              size="small"
              color={health.database === 'connected' ? 'success' : 'error'}
            />
          </Stack>
          <Typography variant="body1">Database: {health.database}</Typography>
          {health.databaseError && <Alert severity="error">DB Error: {health.databaseError}</Alert>}
          <Typography variant="caption" color="text.secondary">
            Timestamp: {health.timestamp}
          </Typography>
        </Stack>
      )}

      {!health && !error && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        </Box>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        Debug tools: <Link href="#/debug/ws">WebSocket</Link>
      </Typography>
    </Container>
  );
}
