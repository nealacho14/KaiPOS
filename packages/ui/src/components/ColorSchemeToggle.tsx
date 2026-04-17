import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useColorScheme } from '../providers/useColorScheme.js';

export type ColorSchemeToggleProps = Omit<IconButtonProps, 'onClick' | 'children'>;

export function ColorSchemeToggle(props: ColorSchemeToggleProps) {
  const { mode, systemMode, setMode } = useColorScheme();
  const resolved = mode === 'system' ? systemMode : mode;

  if (!resolved) {
    return <IconButton {...props} aria-label="Toggle color scheme" disabled />;
  }

  const isDark = resolved === 'dark';
  const next = isDark ? 'light' : 'dark';

  return (
    <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton {...props} aria-label={`Switch to ${next} mode`} onClick={() => setMode(next)}>
        {isDark ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
