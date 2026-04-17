import { alpha, type Components, type CssVarsTheme, type Theme } from '@mui/material/styles';
import { borderRadius } from '../tokens/radius.js';
import { shadows } from '../tokens/shadows.js';

type ThemedTheme = Omit<Theme, 'components'>;

/**
 * `theme.vars` is optional on the base MUI Theme type, but is always defined
 * when the theme was created with `cssVariables`. Cast at the access point
 * so every override below reads through CSS vars (which automatically switch
 * between light/dark color schemes at the CSS layer).
 */
function vars(theme: ThemedTheme): CssVarsTheme['vars'] {
  const v = (theme as Theme & { vars?: CssVarsTheme['vars'] }).vars;
  if (!v) throw new Error('kaiPOSTheme must be created with cssVariables enabled');
  return v;
}

export const componentOverrides: Components<ThemedTheme> = {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        borderRadius: borderRadius.md,
        fontWeight: 600,
        textTransform: 'none',
        minHeight: 44,
        padding: '10px 20px',
        transition: 'all 0.2s ease-in-out',
      },
      sizeSmall: { minHeight: 36, padding: '6px 16px', fontSize: '0.8125rem' },
      sizeLarge: { minHeight: 52, padding: '14px 28px', fontSize: '1rem' },
      contained: {
        boxShadow: shadows.sm,
        '&:hover': { boxShadow: shadows.md },
      },
      outlined: {
        borderWidth: 1.5,
        '&:hover': { borderWidth: 1.5 },
      },
    },
  },

  MuiIconButton: {
    styleOverrides: {
      root: { borderRadius: borderRadius.md, transition: 'all 0.2s ease-in-out' },
      sizeSmall: { padding: 6 },
      sizeMedium: { padding: 10 },
      sizeLarge: { padding: 14 },
    },
  },

  MuiCard: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: borderRadius.xl,
        border: `1px solid ${vars(theme).palette.divider}`,
        backgroundImage: 'none',
        transition: 'all 0.2s ease-in-out',
      }),
    },
  },

  MuiCardContent: {
    styleOverrides: {
      root: { padding: 20, '&:last-child': { paddingBottom: 20 } },
    },
  },

  MuiCardHeader: {
    styleOverrides: {
      root: { padding: '20px 20px 0' },
      title: { fontWeight: 600, fontSize: '1.125rem' },
      subheader: ({ theme }) => ({
        fontSize: '0.875rem',
        color: vars(theme).palette.text.secondary,
      }),
    },
  },

  MuiTextField: {
    defaultProps: { variant: 'outlined', size: 'medium' },
    styleOverrides: {
      root: ({ theme }) => {
        const v = vars(theme);
        return {
          '& .MuiOutlinedInput-root': {
            borderRadius: borderRadius.md,
            transition: 'all 0.2s ease-in-out',
            '& fieldset': { borderWidth: 1.5, borderColor: v.palette.divider },
            '&:hover fieldset': { borderColor: v.palette.text.secondary },
            '&.Mui-focused fieldset': {
              borderWidth: 2,
              borderColor: v.palette.primary.main,
            },
            '&.Mui-error fieldset': { borderColor: v.palette.error.main },
          },
        };
      },
    },
  },

  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        borderRadius: borderRadius.md,
        minHeight: 44,
        '&.MuiInputBase-sizeSmall': { minHeight: 36 },
      },
      input: ({ theme }) => ({
        padding: '12px 14px',
        '&::placeholder': { color: vars(theme).palette.text.secondary, opacity: 1 },
      }),
      notchedOutline: { borderWidth: 1.5 },
    },
  },

  MuiInputLabel: {
    styleOverrides: {
      root: ({ theme }) => ({
        fontSize: '0.875rem',
        fontWeight: 500,
        '&.Mui-focused': { color: vars(theme).palette.primary.main },
      }),
    },
  },

  MuiSelect: {
    styleOverrides: { root: { borderRadius: borderRadius.md } },
  },

  MuiTable: {
    styleOverrides: { root: { borderCollapse: 'separate', borderSpacing: 0 } },
  },

  MuiTableContainer: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: borderRadius.lg,
        border: `1px solid ${vars(theme).palette.divider}`,
        overflow: 'hidden',
      }),
    },
  },

  MuiTableHead: {
    styleOverrides: {
      root: ({ theme }) => {
        const v = vars(theme);
        return {
          backgroundColor: v.palette.action.hover,
          '& .MuiTableCell-head': {
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: v.palette.text.secondary,
            borderBottom: `1px solid ${v.palette.divider}`,
            padding: '14px 16px',
          },
        };
      },
    },
  },

  MuiTableBody: {
    styleOverrides: {
      root: ({ theme }) => ({
        '& .MuiTableRow-root': {
          transition: 'background-color 0.15s ease',
          '&:hover': { backgroundColor: vars(theme).palette.action.hover },
          '&:last-child .MuiTableCell-body': { borderBottom: 'none' },
        },
      }),
    },
  },

  MuiTableCell: {
    styleOverrides: {
      root: ({ theme }) => ({
        borderBottom: `1px solid ${vars(theme).palette.divider}`,
        padding: 16,
        fontSize: '0.875rem',
      }),
      sizeSmall: { padding: '10px 12px' },
    },
  },

  MuiDialog: {
    defaultProps: { PaperProps: { elevation: 0 } },
    styleOverrides: {
      paper: ({ theme }) => ({
        borderRadius: borderRadius['2xl'],
        border: `1px solid ${vars(theme).palette.divider}`,
        backgroundImage: 'none',
        boxShadow: shadows['2xl'],
      }),
    },
  },

  MuiDialogTitle: {
    styleOverrides: {
      root: { padding: '24px 24px 16px', fontSize: '1.25rem', fontWeight: 600 },
    },
  },

  MuiDialogContent: {
    styleOverrides: { root: { padding: '8px 24px 24px' } },
  },

  MuiDialogActions: {
    styleOverrides: { root: { padding: '16px 24px 24px', gap: 12 } },
  },

  MuiChip: {
    styleOverrides: {
      root: { borderRadius: borderRadius.md, fontWeight: 500, fontSize: '0.8125rem' },
      sizeSmall: { height: 24, fontSize: '0.75rem' },
      sizeMedium: { height: 32 },
    },
  },

  MuiBadge: {
    styleOverrides: { badge: { fontWeight: 600, fontSize: '0.75rem' } },
  },

  MuiTabs: {
    styleOverrides: {
      root: { minHeight: 44 },
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
        fontWeight: 500,
        fontSize: '0.875rem',
        minHeight: 44,
        padding: '12px 16px',
        '&.Mui-selected': { fontWeight: 600, color: vars(theme).palette.primary.main },
      }),
    },
  },

  MuiSwitch: {
    styleOverrides: {
      root: { width: 52, height: 28, padding: 0 },
      switchBase: ({ theme }) => ({
        padding: 2,
        '&.Mui-checked': {
          transform: 'translateX(24px)',
          '& .MuiSwitch-thumb': { backgroundColor: '#FFFFFF' },
          '& + .MuiSwitch-track': {
            backgroundColor: vars(theme).palette.primary.main,
            opacity: 1,
          },
        },
      }),
      thumb: { width: 24, height: 24, backgroundColor: '#FFFFFF', boxShadow: shadows.sm },
      track: ({ theme }) => ({
        borderRadius: borderRadius.full,
        backgroundColor: vars(theme).palette.action.disabled,
        opacity: 1,
      }),
    },
  },

  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: borderRadius.lg, padding: '12px 16px' },
    },
  },

  MuiTooltip: {
    defaultProps: { arrow: true },
    styleOverrides: {
      tooltip: ({ theme }) => ({
        backgroundColor: alpha(theme.palette.grey[900], 0.95),
        color: '#F9FAFB',
        fontSize: '0.8125rem',
        fontWeight: 500,
        padding: '8px 12px',
        borderRadius: borderRadius.md,
        boxShadow: shadows.lg,
      }),
      arrow: ({ theme }) => ({ color: alpha(theme.palette.grey[900], 0.95) }),
    },
  },

  MuiAvatar: {
    styleOverrides: { root: { fontWeight: 600, fontSize: '0.875rem' } },
  },

  MuiDrawer: {
    styleOverrides: {
      paper: ({ theme }) => ({
        borderRight: `1px solid ${vars(theme).palette.divider}`,
        backgroundImage: 'none',
      }),
    },
  },

  MuiAppBar: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: ({ theme }) => {
        const v = vars(theme);
        return {
          backgroundColor: v.palette.background.paper,
          color: v.palette.text.primary,
          borderBottom: `1px solid ${v.palette.divider}`,
        };
      },
    },
  },

  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: {
      root: { backgroundImage: 'none' },
      outlined: ({ theme }) => ({ borderColor: vars(theme).palette.divider }),
    },
  },

  MuiMenu: {
    styleOverrides: {
      paper: ({ theme }) => ({
        borderRadius: borderRadius.lg,
        border: `1px solid ${vars(theme).palette.divider}`,
        boxShadow: shadows.lg,
        marginTop: 4,
      }),
    },
  },

  MuiMenuItem: {
    styleOverrides: {
      root: {
        fontSize: '0.875rem',
        padding: '10px 16px',
        borderRadius: borderRadius.sm,
        margin: '2px 8px',
      },
    },
  },

  MuiListItemButton: {
    styleOverrides: {
      root: { borderRadius: borderRadius.md, margin: '2px 8px', padding: '10px 12px' },
    },
  },

  MuiSnackbar: {
    styleOverrides: {
      root: { '& .MuiPaper-root': { borderRadius: borderRadius.lg } },
    },
  },

  MuiSkeleton: {
    styleOverrides: {
      rounded: { borderRadius: borderRadius.md },
    },
  },

  MuiDivider: {
    styleOverrides: {
      root: ({ theme }) => ({ borderColor: vars(theme).palette.divider }),
    },
  },

  MuiCircularProgress: {
    styleOverrides: {
      colorPrimary: ({ theme }) => ({ color: vars(theme).palette.primary.main }),
    },
  },

  MuiLinearProgress: {
    styleOverrides: {
      root: { borderRadius: borderRadius.full, height: 6 },
      bar: { borderRadius: borderRadius.full },
    },
  },
};
