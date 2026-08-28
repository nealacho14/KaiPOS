import { formatCurrency } from '@kaipos/shared';
import { Box, Button, Card, Divider, EmptyState, Stack, Typography } from '@kaipos/ui';
import { useCart } from '../context/CartContext.js';

export interface CartPanelProps {
  currency: string;
}

// Visual-only placeholder. Paso 3 will replace this with the real cart UI:
// line items, qty steppers, applied modifiers, totals, discount lines, and
// the "Cobrar" submission flow.
export function CartPanel({ currency }: CartPanelProps) {
  const { items } = useCart();
  const total = 0;

  return (
    <Card
      variant="ticket"
      data-testid="cart-panel"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        // Square the corners + drop the side/top borders since this card fills
        // the right column (the surrounding layout owns the border).
        borderRadius: 'unset',
        borderLeftWidth: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="h6">Orden actual</Typography>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {items.length === 0 && <EmptyState title="Toca un producto para empezar" />}
      </Box>

      <Divider />

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 2 }}
        data-testid="cart-panel-footer"
      >
        <Typography variant="moneyLg" component="span" data-testid="cart-panel-total">
          {formatCurrency(total, currency)}
        </Typography>
        <Button size="pos" disabled data-testid="cart-panel-checkout">
          Cobrar (Paso 3)
        </Button>
      </Stack>
    </Card>
  );
}
