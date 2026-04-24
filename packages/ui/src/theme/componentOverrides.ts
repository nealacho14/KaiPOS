import type { Components, CssVarsTheme, Theme } from '@mui/material/styles';
import { radius } from '../tokens/radius.js';
import { shadow } from '../tokens/shadows.js';
import { touch } from '../tokens/touch.js';

type ThemedTheme = Omit<Theme, 'components'>;

/**
 * `theme.vars` is optional on the base MUI `Theme` type but is always defined
 * when the theme was created with `cssVariables`. Cast at the access point so
 * every override reads through CSS vars — they auto-switch between light/dark
 * via the `data-color-scheme` selector without re-rendering.
 */
function vars(theme: ThemedTheme): CssVarsTheme['vars'] {
  const v = (theme as Theme & { vars?: CssVarsTheme['vars'] }).vars;
  if (!v) throw new Error('kaiPOSTheme must be created with cssVariables enabled');
  return v;
}

/** `theme.applyStyles` is only defined on cssVariables themes. */
function applyDark(theme: ThemedTheme, styles: Record<string, unknown>): Record<string, unknown> {
  const apply = (theme as { applyStyles?: (scheme: string, s: unknown) => Record<string, unknown> })
    .applyStyles;
  return apply ? apply.call(theme, 'dark', styles) : {};
}

export const componentOverrides: Components<ThemedTheme> = {
  // ---- Global baseline ------------------------------------------------------
  MuiCssBaseline: {
    styleOverrides: {
      'html, body': {
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
      },
      '.tabular, [data-tabular]': { fontVariantNumeric: 'tabular-nums' },
      '[data-touch-surface] *:not(input):not(textarea)': {
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      },
      'button, a': { WebkitTapHighlightColor: 'transparent' },
    },
  },

  // ---- Buttons --------------------------------------------------------------
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: ({ theme }) => ({
        fontWeight: 600,
        textTransform: 'none',
        borderRadius: radius.md,
        minHeight: touch.desktop,
        paddingInline: theme.spacing(4),
        transition: 'background-color 120ms ease, box-shadow 120ms ease, transform 80ms ease',
        '&:focus-visible': { boxShadow: shadow.focus },
        '&:active:not([disabled])': { transform: 'translateY(1px)' },
      }),
      sizeSmall: {
        minHeight: touch.dense,
        fontSize: 13,
        paddingInline: 12,
        borderRadius: radius.sm,
      },
      sizeMedium: { minHeight: touch.desktop, fontSize: 14 },
      sizeLarge: { minHeight: touch.min, fontSize: 15, paddingInline: 20 },
      contained: ({ theme }) => ({
        boxShadow: shadow.xs,
        '&:hover': { boxShadow: shadow.sm },
        '&:active': { boxShadow: shadow.inset },
        '&.Mui-disabled': {
          backgroundColor: vars(theme).palette.action.disabledBackground,
          color: vars(theme).palette.action.disabled,
        },
      }),
      outlined: ({ theme }) => ({
        borderWidth: 1.5,
        '&:hover': { borderWidth: 1.5, backgroundColor: vars(theme).palette.action.hover },
      }),
      text: { paddingInline: 12 },
    },
    variants: [
      {
        props: { size: 'pos' },
        style: {
          minHeight: touch.pos,
          fontSize: 17,
          fontWeight: 650,
          paddingInline: 24,
          borderRadius: radius.md,
        },
      },
      {
        props: { size: 'kds' },
        style: {
          minHeight: touch.kds,
          fontSize: 19,
          fontWeight: 650,
          paddingInline: 28,
          borderRadius: radius.lg,
        },
      },
      {
        props: { variant: 'tile' },
        style: ({ theme }) => ({
          minHeight: 96,
          borderRadius: radius.md,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          backgroundColor: vars(theme).palette.background.paper,
          color: vars(theme).palette.text.primary,
          border: `1px solid ${vars(theme).palette.divider}`,
          boxShadow: shadow.xs,
          textAlign: 'left',
          '&:hover': {
            boxShadow: shadow.sm,
            backgroundColor: vars(theme).palette.action.hover,
          },
          '&:active': { boxShadow: shadow.inset, transform: 'translateY(1px)' },
        }),
      },
      {
        props: { variant: 'danger' },
        style: ({ theme }) => ({
          backgroundColor: vars(theme).palette.error.main,
          color: vars(theme).palette.error.contrastText,
          '&:hover': { backgroundColor: vars(theme).palette.error.dark },
        }),
      },
    ],
  },

  MuiIconButton: {
    styleOverrides: {
      root: {
        borderRadius: radius.sm,
        minWidth: touch.desktop,
        minHeight: touch.desktop,
        '&:focus-visible': { boxShadow: shadow.focus },
      },
      sizeSmall: { minWidth: touch.dense, minHeight: touch.dense },
      sizeLarge: { minWidth: touch.min, minHeight: touch.min },
    },
  },

  MuiButtonBase: {
    defaultProps: { disableRipple: false },
  },

  // ---- Cards ----------------------------------------------------------------
  MuiCard: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.md,
        border: `1px solid ${vars(theme).palette.divider}`,
        backgroundColor: vars(theme).palette.background.paper,
        backgroundImage: 'none',
        overflow: 'hidden',
      }),
    },
    variants: [
      {
        props: { variant: 'raised' },
        style: ({ theme }) => ({
          border: 'none',
          boxShadow: shadow.md,
          backgroundColor: vars(theme).palette.background.paper,
        }),
      },
      {
        props: { variant: 'ticket' },
        style: ({ theme }) => ({
          borderRadius: radius.lg,
          border: `2px solid ${vars(theme).palette.divider}`,
          boxShadow: shadow.sm,
          backgroundColor: vars(theme).palette.background.paper,
        }),
      },
    ],
  },

  MuiCardHeader: {
    styleOverrides: {
      root: { padding: 20, paddingBottom: 12 },
      title: { fontSize: 17, fontWeight: 650, letterSpacing: '-0.005em' },
      subheader: { fontSize: 13, marginTop: 2 },
    },
  },

  MuiCardContent: {
    styleOverrides: {
      root: { padding: 20, '&:last-child': { paddingBottom: 20 } },
    },
  },

  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: { backgroundImage: 'none' },
      rounded: { borderRadius: radius.md },
    },
  },

  // ---- Inputs ---------------------------------------------------------------
  MuiTextField: {
    defaultProps: { variant: 'outlined', size: 'medium' },
  },

  MuiOutlinedInput: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.sm,
        backgroundColor: vars(theme).palette.background.paper,
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: vars(theme).palette.divider,
          transition: 'border-color 120ms ease',
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: vars(theme).palette.textExt.tertiary,
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: vars(theme).palette.primary.main,
          borderWidth: 1.5,
        },
        '&.Mui-focused': { boxShadow: shadow.focus },
        '&.Mui-error .MuiOutlinedInput-notchedOutline': {
          borderColor: vars(theme).palette.error.main,
        },
      }),
      input: ({ theme }) => ({
        paddingBlock: 12,
        paddingInline: 14,
        fontSize: 15,
        '&::placeholder': { opacity: 1, color: vars(theme).palette.textExt.tertiary },
      }),
      sizeSmall: {
        '& .MuiOutlinedInput-input': { paddingBlock: 8, paddingInline: 12, fontSize: 14 },
      },
    },
  },

  MuiInputLabel: {
    styleOverrides: {
      root: { fontSize: 14, fontWeight: 550 },
    },
  },

  MuiFormHelperText: {
    styleOverrides: {
      root: { marginInline: 2, fontSize: 12, marginTop: 6 },
    },
  },

  // ---- Tables ---------------------------------------------------------------
  MuiTable: {
    styleOverrides: {
      root: { borderCollapse: 'separate', borderSpacing: 0 },
    },
  },

  MuiTableHead: {
    styleOverrides: {
      root: ({ theme }) => ({
        '& .MuiTableCell-root': {
          backgroundColor: vars(theme).palette.surfaces.sunken,
          color: vars(theme).palette.text.secondary,
          fontSize: 11,
          fontWeight: 650,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          borderBottom: `1px solid ${vars(theme).palette.divider}`,
          paddingBlock: 10,
        },
      }),
    },
  },

  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderBottom: `1px solid ${vars(theme).palette.divider}`,
        paddingBlock: 12,
        paddingInline: 16,
        fontSize: 14,
        color: vars(theme).palette.text.primary,
      }),
      head: { paddingBlock: 10 },
    },
  },

  MuiTableRow: {
    styleOverrides: {
      root: ({ theme }) => ({
        transition: 'background-color 100ms ease',
        '&:hover': { backgroundColor: vars(theme).palette.action.hover },
        '&.Mui-selected': {
          backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.06)`,
          '&:hover': {
            backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.1)`,
          },
          ...applyDark(theme, {
            backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.14)`,
            '&:hover': {
              backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.18)`,
            },
          }),
        },
        '&:last-of-type .MuiTableCell-root': { borderBottom: 'none' },
      }),
    },
  },

  // ---- Modals / Dialogs ----------------------------------------------------
  MuiDialog: {
    styleOverrides: {
      paper: ({ theme }) => ({
        borderRadius: radius.lg,
        boxShadow: shadow.xl,
        backgroundImage: 'none',
        border: 'none',
        ...applyDark(theme, { border: `1px solid ${vars(theme).palette.divider}` }),
      }),
    },
  },

  MuiDialogTitle: {
    styleOverrides: {
      root: {
        fontSize: 20,
        fontWeight: 650,
        letterSpacing: '-0.01em',
        padding: 24,
        paddingBottom: 12,
      },
    },
  },

  MuiDialogContent: {
    styleOverrides: {
      root: { padding: 24, paddingBlock: 12 },
    },
  },

  MuiDialogActions: {
    styleOverrides: {
      root: { padding: 20, gap: 8 },
    },
  },

  MuiBackdrop: {
    styleOverrides: {
      root: ({ theme }) => ({
        backgroundColor: vars(theme).palette.surfaces.backdrop,
        backdropFilter: 'blur(4px)',
      }),
    },
  },

  // ---- Chips ----------------------------------------------------------------
  MuiChip: {
    defaultProps: { size: 'small' },
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.xs,
        fontWeight: 600,
        fontSize: 12,
        height: 24,
        paddingInline: 2,
        border: `1px solid ${vars(theme).palette.divider}`,
        backgroundColor: vars(theme).palette.surfaces.sunken,
        color: vars(theme).palette.text.secondary,
      }),
      sizeMedium: { height: 28, fontSize: 13 },
      label: { paddingInline: 10 },
      colorPrimary: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.1)`,
        color: vars(theme).palette.primary.dark,
        borderColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.25)`,
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.2)`,
          color: vars(theme).palette.primary.light,
        }),
      }),
      colorSuccess: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.success.mainChannel} / 0.12)`,
        color: vars(theme).palette.success.dark,
        borderColor: `rgba(${vars(theme).palette.success.mainChannel} / 0.25)`,
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.success.mainChannel} / 0.2)`,
          color: vars(theme).palette.success.light,
        }),
      }),
      colorError: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.error.mainChannel} / 0.1)`,
        color: vars(theme).palette.error.dark,
        borderColor: `rgba(${vars(theme).palette.error.mainChannel} / 0.25)`,
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.error.mainChannel} / 0.2)`,
          color: vars(theme).palette.error.light,
        }),
      }),
      colorWarning: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.warning.mainChannel} / 0.15)`,
        color: vars(theme).palette.warning.dark,
        borderColor: `rgba(${vars(theme).palette.warning.mainChannel} / 0.3)`,
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.warning.mainChannel} / 0.2)`,
          color: vars(theme).palette.warning.light,
        }),
      }),
      colorInfo: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.info.mainChannel} / 0.1)`,
        color: vars(theme).palette.info.dark,
        borderColor: `rgba(${vars(theme).palette.info.mainChannel} / 0.25)`,
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.info.mainChannel} / 0.2)`,
          color: vars(theme).palette.info.light,
        }),
      }),
    },
  },

  // ---- Tabs -----------------------------------------------------------------
  MuiTabs: {
    styleOverrides: {
      root: ({ theme }) => ({
        minHeight: touch.desktop + 8,
        borderBottom: `1px solid ${vars(theme).palette.divider}`,
      }),
      indicator: ({ theme }) => ({
        height: 3,
        borderRadius: '3px 3px 0 0',
        backgroundColor: vars(theme).palette.primary.main,
      }),
    },
  },

  MuiTab: {
    styleOverrides: {
      root: ({ theme }) => ({
        textTransform: 'none',
        fontWeight: 600,
        fontSize: 14,
        minHeight: touch.min,
        minWidth: 0,
        padding: '10px 16px',
        color: vars(theme).palette.text.secondary,
        transition: 'color 120ms ease',
        '&:hover': { color: vars(theme).palette.text.primary },
        '&.Mui-selected': { color: vars(theme).palette.primary.main },
        '&:focus-visible': { boxShadow: shadow.focus, borderRadius: radius.sm },
      }),
    },
  },

  // ---- Sidebar navigation ---------------------------------------------------
  MuiDrawer: {
    styleOverrides: {
      paper: ({ theme }) => ({
        backgroundColor: vars(theme).palette.background.paper,
        borderRight: `1px solid ${vars(theme).palette.divider}`,
        backgroundImage: 'none',
      }),
    },
  },

  MuiList: {
    styleOverrides: {
      root: { padding: 8 },
    },
  },

  MuiListItemButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.sm,
        minHeight: touch.min,
        paddingInline: 12,
        marginBlock: 2,
        color: vars(theme).palette.text.secondary,
        gap: 12,
        transition: 'background-color 100ms ease, color 100ms ease',
        '&:hover': {
          backgroundColor: vars(theme).palette.action.hover,
          color: vars(theme).palette.text.primary,
        },
        '&.Mui-selected': {
          backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.1)`,
          color: vars(theme).palette.primary.dark,
          '& .MuiListItemIcon-root': { color: vars(theme).palette.primary.main },
          '&:hover': {
            backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.14)`,
          },
          ...applyDark(theme, {
            backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.18)`,
            color: vars(theme).palette.primary.light,
            '& .MuiListItemIcon-root': { color: vars(theme).palette.primary.light },
            '&:hover': {
              backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.22)`,
            },
          }),
        },
        '&:focus-visible': { boxShadow: shadow.focus },
      }),
    },
  },

  MuiListItemIcon: {
    styleOverrides: {
      root: ({ theme }) => ({
        minWidth: 0,
        marginRight: 0,
        color: vars(theme).palette.textExt.tertiary,
      }),
    },
  },

  MuiListItemText: {
    styleOverrides: {
      primary: { fontSize: 14, fontWeight: 550 },
      secondary: { fontSize: 12 },
    },
  },

  // ---- Snackbars / Alerts ---------------------------------------------------
  MuiSnackbar: {
    defaultProps: { autoHideDuration: 4000 },
  },

  MuiSnackbarContent: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: radius.md,
        backgroundColor: vars(theme).palette.surfaces.inverse,
        color: vars(theme).palette.textExt.inverse,
        fontSize: 14,
        fontWeight: 550,
        padding: '12px 16px',
        boxShadow: shadow.lg,
        minHeight: touch.min,
      }),
    },
  },

  MuiAlert: {
    defaultProps: { variant: 'standard' },
    styleOverrides: {
      root: {
        borderRadius: radius.md,
        padding: '12px 16px',
        fontSize: 14,
        alignItems: 'center',
        border: '1px solid transparent',
      },
      standardSuccess: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.success.mainChannel} / 0.1)`,
        color: vars(theme).palette.success.dark,
        borderColor: `rgba(${vars(theme).palette.success.mainChannel} / 0.25)`,
        '& .MuiAlert-icon': { color: vars(theme).palette.success.main },
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.success.mainChannel} / 0.18)`,
          color: vars(theme).palette.success.light,
        }),
      }),
      standardError: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.error.mainChannel} / 0.1)`,
        color: vars(theme).palette.error.dark,
        borderColor: `rgba(${vars(theme).palette.error.mainChannel} / 0.25)`,
        '& .MuiAlert-icon': { color: vars(theme).palette.error.main },
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.error.mainChannel} / 0.18)`,
          color: vars(theme).palette.error.light,
        }),
      }),
      standardWarning: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.warning.mainChannel} / 0.14)`,
        color: vars(theme).palette.warning.dark,
        borderColor: `rgba(${vars(theme).palette.warning.mainChannel} / 0.3)`,
        '& .MuiAlert-icon': { color: vars(theme).palette.warning.main },
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.warning.mainChannel} / 0.2)`,
          color: vars(theme).palette.warning.light,
        }),
      }),
      standardInfo: ({ theme }) => ({
        backgroundColor: `rgba(${vars(theme).palette.info.mainChannel} / 0.1)`,
        color: vars(theme).palette.info.dark,
        borderColor: `rgba(${vars(theme).palette.info.mainChannel} / 0.25)`,
        '& .MuiAlert-icon': { color: vars(theme).palette.info.main },
        ...applyDark(theme, {
          backgroundColor: `rgba(${vars(theme).palette.info.mainChannel} / 0.18)`,
          color: vars(theme).palette.info.light,
        }),
      }),
    },
  },

  // ---- Misc -----------------------------------------------------------------
  MuiTooltip: {
    styleOverrides: {
      tooltip: ({ theme }) => ({
        backgroundColor: vars(theme).palette.surfaces.inverse,
        color: vars(theme).palette.textExt.inverse,
        fontSize: 12,
        fontWeight: 550,
        borderRadius: radius.sm,
        padding: '6px 10px',
      }),
      arrow: ({ theme }) => ({
        color: vars(theme).palette.surfaces.inverse,
      }),
    },
  },

  MuiDivider: {
    styleOverrides: {
      root: ({ theme }) => ({ borderColor: vars(theme).palette.divider }),
    },
  },

  MuiSwitch: {
    styleOverrides: {
      root: { padding: 8 },
      switchBase: ({ theme }) => ({
        // Thumb stays white in both states so it reads against the colored
        // track — otherwise the checked-teal thumb disappears onto the
        // checked-teal track in light mode.
        color: '#fff',
        '&.Mui-checked': {
          color: '#fff',
          '& + .MuiSwitch-track': {
            backgroundColor: vars(theme).palette.primary.main,
            opacity: 1,
          },
        },
      }),
      thumb: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
      },
      track: ({ theme }) => ({
        borderRadius: 11,
        backgroundColor: vars(theme).palette.grey[300],
        opacity: 1,
        ...applyDark(theme, { backgroundColor: vars(theme).palette.grey[700] }),
      }),
    },
  },

  MuiCheckbox: {
    styleOverrides: {
      root: ({ theme }) => ({
        color: vars(theme).palette.divider,
        '&.Mui-checked': { color: vars(theme).palette.primary.main },
        '&:focus-visible': { boxShadow: shadow.focus, borderRadius: radius.xs },
      }),
    },
  },

  MuiLinearProgress: {
    styleOverrides: {
      root: ({ theme }) => ({
        height: 6,
        borderRadius: 3,
        backgroundColor: vars(theme).palette.surfaces.sunken,
      }),
      bar: { borderRadius: 3 },
    },
  },
};
