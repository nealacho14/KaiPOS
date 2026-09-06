import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider, type Theme } from '@mui/material/styles';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CssBaseline from '@mui/material/CssBaseline';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { componentOverrides } from './componentOverrides.js';
import { kaiPOSTheme } from './index.js';

function KitchenSink() {
  return (
    <>
      <Button variant="contained" size="small">
        s
      </Button>
      <Button variant="outlined" size="medium">
        m
      </Button>
      <Button variant="text" size="large">
        l
      </Button>
      <Button size="pos">pos</Button>
      <Button size="kds">kds</Button>
      <Button variant="tile">tile</Button>
      <Button variant="danger">danger</Button>
      <IconButton size="small" aria-label="ib-s" />
      <IconButton size="large" aria-label="ib-l" />
      <Card>
        <CardHeader title="t" subheader="s" />
        <CardContent>c</CardContent>
      </Card>
      <Card variant="raised">raised</Card>
      <Card variant="ticket">ticket</Card>
      <Paper>paper</Paper>
      <TextField label="label" helperText="help" size="small" />
      <TextField label="label2" error helperText="oops" />
      <InputLabel>inline</InputLabel>
      <FormHelperText>helper</FormHelperText>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>head</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow selected>
            <TableCell>cell</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>cell2</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Dialog open>
        <DialogTitle>title</DialogTitle>
        <DialogContent>content</DialogContent>
        <DialogActions>actions</DialogActions>
      </Dialog>
      <Chip label="default" />
      <Chip label="medium" size="medium" />
      <Chip label="primary" color="primary" />
      <Chip label="success" color="success" />
      <Chip label="error" color="error" />
      <Chip label="warning" color="warning" />
      <Chip label="info" color="info" />
      <Tabs value={0}>
        <Tab label="one" />
        <Tab label="two" />
      </Tabs>
      <Drawer open variant="permanent">
        <List>
          <ListItemButton selected>
            <ListItemIcon>icon</ListItemIcon>
            <ListItemText primary="primary" secondary="secondary" />
          </ListItemButton>
          <ListItemButton>
            <ListItemText primary="other" />
          </ListItemButton>
        </List>
      </Drawer>
      <Snackbar open message="snack" />
      <Alert severity="success">success</Alert>
      <Alert severity="error">error</Alert>
      <Alert severity="warning">warning</Alert>
      <Alert severity="info">info</Alert>
      <Tooltip title="tip" open>
        <span>hover</span>
      </Tooltip>
      <Divider />
      <Switch defaultChecked />
      <Switch />
      <Checkbox defaultChecked />
      <LinearProgress value={50} variant="determinate" />
    </>
  );
}
// Rendering every MUI component once is heavy on shared CI runners (it has
// hit the default 5 s budget with the same code that takes ~1 s locally).
const KITCHEN_SINK_TIMEOUT_MS = 20_000;

describe('componentOverrides — integration', () => {
  it(
    'renders a kitchen-sink of components against the kaiPOSTheme without throwing',
    () => {
      expect(() =>
        render(
          <ThemeProvider theme={kaiPOSTheme}>
            <CssBaseline />
            <KitchenSink />
          </ThemeProvider>,
        ),
      ).not.toThrow();
    },
    KITCHEN_SINK_TIMEOUT_MS,
  );
});

// --- Internal-helper branches ----------------------------------------------
// `vars(theme)` throws when the theme wasn't created with `cssVariables`,
// and `applyDark(theme, …)` falls back to an empty object when
// `theme.applyStyles` is missing. Both helpers are private — we exercise the
// branches indirectly by invoking specific override callbacks with crafted
// theme stubs.

type AnyOverride = (args: { theme: unknown }) => unknown;

function pickFnOverride(overrides: Record<string, unknown> | undefined, key: string): AnyOverride {
  const fn = overrides?.[key];
  if (typeof fn !== 'function') {
    throw new Error(`Expected ${key} override to be a function`);
  }
  return fn as AnyOverride;
}

describe('componentOverrides — defensive branches', () => {
  it('throws a helpful error when the theme is missing `vars`', () => {
    // `contained` reaches into `vars(theme).palette.action.*` — without
    // cssVariables on the theme, `vars()` throws.
    const buttonContained = pickFnOverride(
      componentOverrides.MuiButton?.styleOverrides,
      'contained',
    );
    expect(() => buttonContained({ theme: {} })).toThrow(/cssVariables/);
  });

  it('returns empty styles for the dark branch when `applyStyles` is missing', () => {
    // Build a stub theme with vars present (so `vars(theme)` succeeds) but no
    // `applyStyles` method (so `applyDark` falls back to `{}`).
    const stub = (kaiPOSTheme as unknown as { vars: unknown }).vars
      ? { vars: (kaiPOSTheme as unknown as { vars: unknown }).vars }
      : null;
    expect(stub).not.toBeNull();

    const dialogPaper = pickFnOverride(componentOverrides.MuiDialog?.styleOverrides, 'paper');
    expect(() => dialogPaper({ theme: stub as unknown as Theme })).not.toThrow();
  });
});
