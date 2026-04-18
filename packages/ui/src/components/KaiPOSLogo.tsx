import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useColorScheme } from '../providers/useColorScheme.js';
import { colors } from '../tokens/colors.js';

/**
 * Brand palette — teal mark + amber accent per the kaiPOS canon
 * (`kaiPos-ds/theme.ts`). Hardcoded here so the logo stays consistent
 * regardless of the active MUI theme primary.
 */
const BRAND = {
  mark: colors.primary[500], // #0B7A75 — teal 500
  accent: colors.secondary[400], // #E8833A — amber 400
  ink: colors.grey[900], // #141412 — warm slate 900 (wordmark "kai")
} as const;

export type LogoVariant = 'horizontal' | 'stacked' | 'icon' | 'wordmark';
/**
 * Visual treatment of the logo.
 * - `color`: full-color mark (navy square + white K + blue accent) — use on light backgrounds.
 * - `white`: outlined mark with white strokes — use on dark backgrounds.
 * - `dark`: outlined mark with navy strokes — alternate for light backgrounds.
 * - `auto` (default): picks `color` in light mode and `white` in dark mode via the active color scheme.
 */
export type LogoColorVariant = 'color' | 'white' | 'dark' | 'auto';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

type ResolvedColorVariant = Exclude<LogoColorVariant, 'auto'>;

const SIZES: Record<LogoSize, { icon: number; text: number; gap: number }> = {
  xs: { icon: 20, text: 12, gap: 4 },
  sm: { icon: 32, text: 18, gap: 6 },
  md: { icon: 48, text: 24, gap: 8 },
  lg: { icon: 64, text: 32, gap: 12 },
  xl: { icon: 96, text: 48, gap: 16 },
  xxl: { icon: 128, text: 64, gap: 20 },
};

interface KMarkProps {
  size: number;
  colorVariant: ResolvedColorVariant;
}

function KMark({ size, colorVariant }: KMarkProps) {
  const nodeSize = size * 0.12;
  const strokeWidth = size * 0.04;
  const radius = size * 0.22;

  const bgColor = colorVariant === 'color' ? BRAND.mark : 'transparent';
  const borderColor = colorVariant === 'white' ? '#FFFFFF' : BRAND.mark;
  const letterColor = colorVariant === 'color' ? '#FFFFFF' : borderColor;
  const accentColor =
    colorVariant === 'color'
      ? BRAND.accent
      : colorVariant === 'white'
        ? 'rgba(255,255,255,0.4)'
        : BRAND.accent;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${radius}px`,
        backgroundColor: bgColor,
        border: colorVariant === 'color' ? 'none' : `${strokeWidth}px solid ${borderColor}`,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <Typography
        component="span"
        sx={{
          fontFamily: '"Inter", -apple-system, sans-serif',
          fontWeight: 700,
          fontSize: size * 0.5,
          color: letterColor,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          position: 'relative',
          zIndex: 2,
        }}
      >
        K
      </Typography>

      {/* Accent node — top-right */}
      <Box
        sx={{
          position: 'absolute',
          top: size * 0.12,
          right: size * 0.12,
          width: nodeSize,
          height: nodeSize,
          borderRadius: '50%',
          backgroundColor: accentColor,
          zIndex: 3,
        }}
      />

      {/* Connection line from K toward the node */}
      <Box
        sx={{
          position: 'absolute',
          top: size * 0.22,
          right: size * 0.18,
          width: size * 0.18,
          height: strokeWidth * 0.75,
          backgroundColor: accentColor,
          transform: 'rotate(-45deg)',
          transformOrigin: 'right center',
          zIndex: 1,
          opacity: 0.6,
        }}
      />

      {/* Bottom grid line for the terminal reference */}
      <Box
        sx={{
          position: 'absolute',
          bottom: size * 0.15,
          left: size * 0.15,
          right: size * 0.15,
          height: strokeWidth * 0.5,
          backgroundColor: colorVariant === 'color' ? 'rgba(255,255,255,0.15)' : `${borderColor}33`,
          zIndex: 1,
        }}
      />
    </Box>
  );
}

interface WordmarkProps {
  size: number;
  colorVariant: ResolvedColorVariant;
}

function Wordmark({ size, colorVariant }: WordmarkProps) {
  const kaiColor = colorVariant === 'white' ? '#FFFFFF' : BRAND.ink;
  const posColor = colorVariant === 'white' ? '#FFFFFF' : BRAND.mark;

  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
      <Typography
        component="span"
        sx={{
          fontFamily: '"Inter", -apple-system, sans-serif',
          fontWeight: 400,
          fontSize: size,
          color: kaiColor,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        kai
      </Typography>
      <Typography
        component="span"
        sx={{
          fontFamily: '"Inter", -apple-system, sans-serif',
          fontWeight: 700,
          fontSize: size,
          color: posColor,
          lineHeight: 1,
          letterSpacing: '-0.01em',
        }}
      >
        POS
      </Typography>
    </Box>
  );
}

export interface KaiPOSLogoProps {
  variant?: LogoVariant;
  colorVariant?: LogoColorVariant;
  size?: LogoSize;
}

function useResolvedColorVariant(requested: LogoColorVariant): ResolvedColorVariant {
  const { mode, systemMode } = useColorScheme();
  if (requested !== 'auto') return requested;
  const resolved = mode === 'system' ? systemMode : mode;
  return resolved === 'dark' ? 'white' : 'color';
}

export function KaiPOSLogo({
  variant = 'horizontal',
  colorVariant = 'auto',
  size = 'md',
}: KaiPOSLogoProps) {
  const s = SIZES[size];
  const resolved = useResolvedColorVariant(colorVariant);

  if (variant === 'icon') {
    return <KMark size={s.icon} colorVariant={resolved} />;
  }

  if (variant === 'wordmark') {
    return <Wordmark size={s.text} colorVariant={resolved} />;
  }

  if (variant === 'stacked') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: `${s.gap}px`,
        }}
      >
        <KMark size={s.icon} colorVariant={resolved} />
        <Wordmark size={s.text * 0.75} colorVariant={resolved} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: `${s.gap}px` }}>
      <KMark size={s.icon} colorVariant={resolved} />
      <Wordmark size={s.text} colorVariant={resolved} />
    </Box>
  );
}
