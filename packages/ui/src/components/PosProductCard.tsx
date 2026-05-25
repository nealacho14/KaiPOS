import { ImageIcon } from '../icons/index.js';
import { Box, Chip, Stack, Typography, type SxProps, type Theme } from './index.js';

export interface PosProductCardChip {
  key: string;
  label: string;
  color?: 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  variant?: 'filled' | 'outlined';
}

export interface PosProductCardProps {
  name: string;
  /** Already-formatted price string (e.g. `$120.00`). */
  price: string;
  imageUrl?: string;
  /** Top-row chips, e.g. allergens. Capped to 3 visually. */
  topChips?: PosProductCardChip[];
  /** Bottom-right chip — e.g. "Configurable" for products with required modifiers. */
  trailingChip?: PosProductCardChip;
  /** When true, renders as a `<button>` so the parent can attach an `onClick`. */
  interactive?: boolean;
  onClick?: () => void;
  /** Briefly outlines the card in the primary color to signal a successful scan. */
  highlighted?: boolean;
  ariaLabel?: string;
  productId?: string;
  testId?: string;
  sx?: SxProps<Theme>;
}

// Visual primitive shared by the POS catalog grid and the admin's product-form
// preview ("Vista en POS"). Keeps both surfaces in lockstep when the design
// system shifts. Purely presentational — callers translate allergens / format
// prices upstream.
export function PosProductCard({
  name,
  price,
  imageUrl,
  topChips,
  trailingChip,
  interactive,
  onClick,
  highlighted,
  ariaLabel,
  productId,
  testId,
  sx,
}: PosProductCardProps) {
  const baseSx: SxProps<Theme> = (theme) => ({
    width: '100%',
    p: 2,
    borderRadius: `${theme.radii.md}px`,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    color: 'text.primary',
    minHeight: 110,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 1.5,
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
    outline: highlighted ? `2px solid ${theme.palette.primary.main}` : 'none',
    outlineOffset: highlighted ? '-2px' : 0,
    ...(interactive && {
      // Reset <button> defaults the box would otherwise inherit.
      appearance: 'none',
      font: 'inherit',
      textAlign: 'left',
      cursor: 'pointer',
      '&:hover': {
        borderColor: theme.palette.text.primary,
        backgroundColor: theme.palette.action.hover,
      },
      '&:focus-visible': {
        outline: `2px solid ${theme.palette.primary.main}`,
        outlineOffset: 2,
      },
      '&:active': { transform: 'translateY(1px)' },
    }),
  });

  const content = (
    <>
      <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ width: '100%' }}>
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt=""
            sx={(theme) => ({
              width: 48,
              height: 48,
              borderRadius: `${theme.radii.sm}px`,
              objectFit: 'cover',
              border: '1px solid',
              borderColor: 'divider',
              flexShrink: 0,
            })}
          />
        ) : (
          <Box
            aria-hidden
            sx={(theme) => ({
              width: 48,
              height: 48,
              borderRadius: `${theme.radii.sm}px`,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'action.hover',
              color: 'text.disabled',
              flexShrink: 0,
            })}
          >
            <ImageIcon size={20} aria-hidden />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {name}
          </Typography>
          {topChips && topChips.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
              {topChips.slice(0, 3).map((chip) => (
                <Chip
                  key={chip.key}
                  label={chip.label}
                  size="small"
                  color={chip.color ?? 'default'}
                  variant={chip.variant ?? 'outlined'}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ width: '100%' }}
      >
        <Typography variant="money" component="div">
          {price}
        </Typography>
        {trailingChip && (
          <Chip
            label={trailingChip.label}
            size="small"
            color={trailingChip.color ?? 'default'}
            variant={trailingChip.variant ?? 'outlined'}
          />
        )}
      </Stack>
    </>
  );

  const sharedProps = {
    'data-product-id': productId,
    'data-highlighted': highlighted ? 'true' : undefined,
    'data-testid': testId,
    'aria-label': ariaLabel,
  } as const;

  const mergedSx: SxProps<Theme> = sx ? [baseSx, ...(Array.isArray(sx) ? sx : [sx])] : baseSx;

  if (interactive) {
    return (
      <Box component="button" type="button" onClick={onClick} sx={mergedSx} {...sharedProps}>
        {content}
      </Box>
    );
  }

  return (
    <Box sx={mergedSx} {...sharedProps}>
      {content}
    </Box>
  );
}
