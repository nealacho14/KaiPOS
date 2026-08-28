import { Box, useLayoutMode, type WsStatusChipStatus } from '@kaipos/ui';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  ActiveBranchProvider,
  getSession,
  useAuth,
  useWebSocketActions,
  useWebSocketState,
  WebSocketProvider,
} from '@kaipos/app-runtime';
import { Header, Sidebar, SIDEBAR_WIDTH } from '../components/index.js';

function getWsEndpoint(): string {
  return import.meta.env.VITE_WS_ENDPOINT ?? '';
}

function AppLayoutShell() {
  const mode = useLayoutMode();
  // A permanent 240px sidebar would leave 528px of content on a 768px tablet,
  // so tablets keep the temporary drawer and only gain roomier padding.
  const isDesktop = mode === 'desktop';
  const { status } = useAuth();
  const wsActions = useWebSocketActions();
  const wsState = useWebSocketState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!wsState.hasEndpoint) return;
    if (status !== 'authenticated') return;
    const session = getSession();
    if (!session?.accessToken) return;
    // 'failed' is terminal (reconnect attempts exhausted / dead session) —
    // auto-connecting here would silently re-arm the retry loop forever.
    if (
      wsState.status === 'open' ||
      wsState.status === 'connecting' ||
      wsState.status === 'reconnecting' ||
      wsState.status === 'failed'
    ) {
      return;
    }
    wsActions.connect(session.accessToken);
  }, [status, wsState.hasEndpoint, wsState.status, wsActions]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      wsActions.disconnect();
    }
  }, [status, wsActions]);

  const chipStatus: WsStatusChipStatus = wsState.hasEndpoint ? wsState.status : 'idle';

  return (
    <Box
      sx={{
        minHeight: '100dvh',
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
            px: { xs: 2, sm: 3, md: 4 },
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
    <ActiveBranchProvider>
      <WebSocketProvider initialEndpoint={getWsEndpoint()}>
        <AppLayoutShell />
      </WebSocketProvider>
    </ActiveBranchProvider>
  );
}
