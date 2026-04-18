import { Box, useMediaQuery, useTheme } from '@kaipos/ui';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header, Sidebar, SIDEBAR_WIDTH } from '../components/index.js';
import type { WsStatusChipStatus } from '../components/index.js';
import { useAuth } from '../context/AuthContext.js';
import { WebSocketProvider, useWebSocketContext } from '../context/WebSocketContext.js';
import { getSession } from '../lib/auth-storage.js';

function getWsEndpoint(): string {
  return import.meta.env.VITE_WS_ENDPOINT ?? '';
}

function AppLayoutShell() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { status } = useAuth();
  const ws = useWebSocketContext();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!ws.hasEndpoint) return;
    if (status !== 'authenticated') return;
    const session = getSession();
    if (!session?.accessToken) return;
    if (ws.status === 'open' || ws.status === 'connecting' || ws.status === 'reconnecting') return;
    ws.connect(session.accessToken);
  }, [status, ws]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      ws.disconnect();
    }
  }, [status, ws]);

  const chipStatus: WsStatusChipStatus = ws.hasEndpoint ? ws.status : 'idle';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <Header
        wsStatus={chipStatus}
        onMenuToggle={isDesktop ? undefined : () => setDrawerOpen((v) => !v)}
      />
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} isDesktop={isDesktop} />
        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            px: { xs: 2, md: 4 },
            py: { xs: 3, md: 4 },
            maxWidth: { md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
          }}
        >
          <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%' }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function AppLayout() {
  return (
    <WebSocketProvider initialEndpoint={getWsEndpoint()}>
      <AppLayoutShell />
    </WebSocketProvider>
  );
}
