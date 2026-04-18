export { default as Alert, type AlertProps } from '@mui/material/Alert';
export { default as AlertTitle } from '@mui/material/AlertTitle';
export { default as AppBar, type AppBarProps } from '@mui/material/AppBar';
export { default as Avatar, type AvatarProps } from '@mui/material/Avatar';
export { default as Badge } from '@mui/material/Badge';
export { default as Box, type BoxProps } from '@mui/material/Box';
export { default as Button, type ButtonProps } from '@mui/material/Button';
export { default as Card, type CardProps } from '@mui/material/Card';
export { default as CardActions } from '@mui/material/CardActions';
export { default as CardContent } from '@mui/material/CardContent';
export { default as CardHeader } from '@mui/material/CardHeader';
export { default as Checkbox, type CheckboxProps } from '@mui/material/Checkbox';
export { default as Chip, type ChipProps } from '@mui/material/Chip';
export { default as CircularProgress } from '@mui/material/CircularProgress';
export { default as Container } from '@mui/material/Container';
export { default as Dialog, type DialogProps } from '@mui/material/Dialog';
export { default as DialogActions } from '@mui/material/DialogActions';
export { default as DialogContent } from '@mui/material/DialogContent';
export { default as DialogContentText } from '@mui/material/DialogContentText';
export { default as DialogTitle } from '@mui/material/DialogTitle';
export { default as Divider } from '@mui/material/Divider';
export { default as Drawer, type DrawerProps } from '@mui/material/Drawer';
export { default as FormControl } from '@mui/material/FormControl';
export {
  default as FormControlLabel,
  type FormControlLabelProps,
} from '@mui/material/FormControlLabel';
export { default as FormHelperText } from '@mui/material/FormHelperText';
export { default as IconButton, type IconButtonProps } from '@mui/material/IconButton';
export { default as InputLabel } from '@mui/material/InputLabel';
export { default as LinearProgress } from '@mui/material/LinearProgress';
export { default as Link, type LinkProps } from '@mui/material/Link';
export { default as List, type ListProps } from '@mui/material/List';
export { default as ListItem, type ListItemProps } from '@mui/material/ListItem';
export { default as ListItemButton, type ListItemButtonProps } from '@mui/material/ListItemButton';
export { default as ListItemIcon } from '@mui/material/ListItemIcon';
export { default as ListItemText, type ListItemTextProps } from '@mui/material/ListItemText';
export { default as Menu, type MenuProps } from '@mui/material/Menu';
export { default as MenuItem, type MenuItemProps } from '@mui/material/MenuItem';
export { default as Paper } from '@mui/material/Paper';
export { default as Select, type SelectProps } from '@mui/material/Select';
export { default as Skeleton } from '@mui/material/Skeleton';
export { default as Snackbar, type SnackbarProps } from '@mui/material/Snackbar';
export { default as Stack, type StackProps } from '@mui/material/Stack';
export { default as Switch } from '@mui/material/Switch';
export { default as Tab } from '@mui/material/Tab';
export { default as Table } from '@mui/material/Table';
export { default as TableBody } from '@mui/material/TableBody';
export { default as TableCell } from '@mui/material/TableCell';
export { default as TableContainer } from '@mui/material/TableContainer';
export { default as TableHead } from '@mui/material/TableHead';
export { default as TableRow } from '@mui/material/TableRow';
export { default as Tabs, type TabsProps } from '@mui/material/Tabs';
export { default as TextField, type TextFieldProps } from '@mui/material/TextField';
export { default as Toolbar, type ToolbarProps } from '@mui/material/Toolbar';
export { default as Tooltip, type TooltipProps } from '@mui/material/Tooltip';
export { default as Typography, type TypographyProps } from '@mui/material/Typography';

// Hooks & utilities from @mui/material/styles, surfaced here so consumer code
// never imports `@mui/material/*` directly.
export { useTheme, alpha, type Theme, type SxProps } from '@mui/material/styles';
export { default as useMediaQuery } from '@mui/material/useMediaQuery';

export { ColorSchemeToggle, type ColorSchemeToggleProps } from './ColorSchemeToggle.js';
export {
  KaiPOSLogo,
  type KaiPOSLogoProps,
  type LogoColorVariant,
  type LogoSize,
  type LogoVariant,
} from './KaiPOSLogo.js';

// Icon surface — `lucide-react` is the canonical icon set for the shell.
// Re-exported here so consumer code never imports `lucide-react` directly,
// keeping the icon origin swappable without a workspace-wide rewrite.
export {
  AlertCircle,
  ChevronDown,
  Eye,
  EyeOff,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Radio,
  Users as UsersIcon,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
