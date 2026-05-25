import {
  Box,
  Drawer,
  IconButton,
  Stack,
  Typography,
  type WsStatusChipStatus,
  useMediaQuery,
  useTheme,
} from '@kaipos/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  ActiveBranchProvider,
  getSession,
  useActiveBranch,
  useAuth,
  useWebSocketContext,
  WebSocketProvider,
} from '@kaipos/app-runtime';
import { CartPanel } from '../components/CartPanel.js';
import { PosHeader } from '../components/PosHeader.js';
import { CartProvider } from '../context/CartContext.js';
import { CatalogProvider } from '../state/CatalogProvider.js';

// Used as a last-resort fallback when the active session has no business
// (super_admin) and money formatting still needs a currency. Real tenants
// carry `business.currency` (ISO 4217) plumbed through the auth payload.
const FALLBACK_CURRENCY = 'MXN';

function getWsEndpoint(): string {
  return import.meta.env.VITE_WS_ENDPOINT ?? '';
}

// Right-panel width clamp (px). 360 keeps the cart usable on a 1280-wide
// desktop; 480 prevents it from eating into the catalog grid on ultrawides.
const CART_PANEL_MIN = 360;
const CART_PANEL_MAX = 480;

function GatingRedirect({ children }: { children: ReactNode }) {
  const { user, business } = useAuth();
  const { branchIds } = useActiveBranch();
  const location = useLocation();

  // Super_admin without a selected business needs to pick one before the
  // catalog endpoints can scope correctly.
  if (user?.role === 'super_admin' && !business) {
    if (location.pathname !== '/select-business') {
      return <Navigate to="/select-business" replace />;
    }
  }

  // Non-super_admin users without any assigned branches can't operate the
  // POS at all — surface a dedicated empty state.
  if (user && user.role !== 'super_admin' && branchIds.length === 0) {
    if (location.pathname !== '/no-branch') {
      return <Navigate to="/no-branch" replace />;
    }
  }

  return <>{children}</>;
}

function PosLayoutShell() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { status, business } = useAuth();
  const ws = useWebSocketContext();
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

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

  // Right-panel content is the same on desktop and mobile — desktop pins it
  // as a fixed-width column; mobile slides it up as a bottom drawer.
  const cartPanel = (
    <Box
      data-testid="pos-cart-panel"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderLeft: { md: '1px solid' },
        borderColor: { md: 'divider' },
      }}
    >
      <CartPanel currency={business?.currency ?? FALLBACK_CURRENCY} />
    </Box>
  );

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <PosHeader wsStatus={chipStatus} />

      <GatingRedirect>
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Box
            component="main"
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {!isDesktop && (
              <Stack
                direction="row"
                justifyContent="flex-end"
                sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <IconButton
                  data-testid="pos-open-cart"
                  aria-label="Abrir orden actual"
                  onClick={() => setCartDrawerOpen(true)}
                  size="small"
                >
                  <Typography variant="button">Ver orden</Typography>
                </IconButton>
              </Stack>
            )}
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Outlet />
            </Box>
          </Box>

          {isDesktop && (
            <Box
              data-testid="pos-cart-pane-desktop"
              sx={{
                flex: '0 0 30%',
                minWidth: CART_PANEL_MIN,
                maxWidth: CART_PANEL_MAX,
                height: '100%',
              }}
            >
              {cartPanel}
            </Box>
          )}
        </Box>
      </GatingRedirect>

      {!isDesktop && (
        <Drawer
          anchor="bottom"
          variant="persistent"
          open={cartDrawerOpen}
          onClose={() => setCartDrawerOpen(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            sx: { height: '70vh', display: 'flex', flexDirection: 'column' },
          }}
        >
          <Stack
            direction="row"
            justifyContent="flex-end"
            sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <IconButton
              aria-label="Cerrar orden actual"
              onClick={() => setCartDrawerOpen(false)}
              size="small"
            >
              <Typography variant="button">Cerrar</Typography>
            </IconButton>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0 }}>{cartPanel}</Box>
        </Drawer>
      )}
    </Box>
  );
}

export function PosLayout() {
  return (
    <ActiveBranchProvider>
      <WebSocketProvider initialEndpoint={getWsEndpoint()}>
        <CartProvider>
          <CatalogProvider>
            <PosLayoutShell />
          </CatalogProvider>
        </CartProvider>
      </WebSocketProvider>
    </ActiveBranchProvider>
  );
}
