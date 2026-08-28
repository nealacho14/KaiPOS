import { DEFAULT_CURRENCY } from '@kaipos/shared';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Stack,
  Typography,
  type WsStatusChipStatus,
  useLayoutMode,
} from '@kaipos/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  ActiveBranchProvider,
  OfflineBanner,
  getSession,
  useActiveBranch,
  useAuth,
  useWebSocketActions,
  useWebSocketState,
  WebSocketProvider,
} from '@kaipos/app-runtime';
import { CartPanel } from '../components/CartPanel.js';
import { PosHeader } from '../components/PosHeader.js';
import { CartProvider } from '../context/CartContext.js';
import { CatalogProvider } from '../state/CatalogProvider.js';

// Used as a last-resort fallback when the active session has no business
// (super_admin) and money formatting still needs a currency. Real tenants
// carry `business.currency` (ISO 4217) plumbed through the auth payload.
const FALLBACK_CURRENCY = DEFAULT_CURRENCY;

function getWsEndpoint(): string {
  return import.meta.env.VITE_WS_ENDPOINT ?? '';
}

// Right-panel width clamps (px). 360 keeps the cart usable on a 1280-wide
// desktop; 480 prevents it from eating into the catalog grid on ultrawides.
const CART_PANEL_MIN = 360;
const CART_PANEL_MAX = 480;
// A tablet in portrait is only 768 px wide, so the desktop 360 px floor would
// leave ~408 px of catalog. Shrinking the cart to ~307 px leaves ~430 px, which
// fits three tiles at the `sm` grid floor in ProductGrid.
const CART_PANEL_TABLET_MIN = 300;
const CART_PANEL_TABLET_MAX = 360;

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
  const mode = useLayoutMode();
  // Tablet and desktop both pin the cart beside the catalog; only a phone (or a
  // handset in landscape, which has no vertical room) falls back to the drawer.
  const isSplit = mode !== 'phone';
  const { status, business } = useAuth();
  const wsActions = useWebSocketActions();
  const wsState = useWebSocketState();
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

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
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <PosHeader wsStatus={chipStatus} />
      <OfflineBanner />

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
            {!isSplit && (
              <Stack
                direction="row"
                sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
              >
                {/* Opening the cart is the primary action on a phone, so it is a
                    real full-width button at the POS touch height — not an
                    IconButton wrapping text, which was neither. */}
                <Button
                  data-testid="pos-open-cart"
                  aria-label="Abrir orden actual"
                  onClick={() => setCartDrawerOpen(true)}
                  variant="outlined"
                  size="pos"
                  fullWidth
                >
                  Ver orden
                </Button>
              </Stack>
            )}
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Outlet />
            </Box>
          </Box>

          {isSplit && (
            <Box
              data-testid="pos-cart-pane-desktop"
              sx={{
                flex: mode === 'tablet' ? '0 0 40%' : '0 0 30%',
                minWidth: mode === 'tablet' ? CART_PANEL_TABLET_MIN : CART_PANEL_MIN,
                maxWidth: mode === 'tablet' ? CART_PANEL_TABLET_MAX : CART_PANEL_MAX,
                height: '100%',
              }}
            >
              {cartPanel}
            </Box>
          )}
        </Box>
      </GatingRedirect>

      {!isSplit && (
        <Drawer
          anchor="bottom"
          // `temporary`, not `persistent`: a persistent Drawer renders no Modal
          // and no backdrop, so `onClose` never fired and tapping outside the
          // cart did nothing.
          variant="temporary"
          open={cartDrawerOpen}
          onClose={() => setCartDrawerOpen(false)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            sx: (theme) => ({
              // `dvh` tracks the collapsing mobile URL bar; `vh` does not, and
              // left the cart footer below the fold on iOS Safari.
              height: '70dvh',
              display: 'flex',
              flexDirection: 'column',
              pb: theme.safeArea.bottom,
            }),
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
