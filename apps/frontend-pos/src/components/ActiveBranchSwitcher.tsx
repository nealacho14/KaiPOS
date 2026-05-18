import { Chip, FormControl, InputLabel, MenuItem, Select, type SelectProps } from '@kaipos/ui';
import { useEffect } from 'react';
import { useActiveBranch } from '../hooks/useActiveBranch.js';
import { useBranches } from '../hooks/useBranches.js';

export interface ActiveBranchSwitcherProps {
  size?: SelectProps['size'];
}

// Header control for the app-wide active branch. Writes go through
// `useActiveBranch`, which is backed by `ActiveBranchProvider` — so changing
// the branch here updates every page that reads the same hook.
export function ActiveBranchSwitcher({ size = 'small' }: ActiveBranchSwitcherProps) {
  const { branchId, setBranchId, branchIds, canManage } = useActiveBranch();
  const { branches } = useBranches();

  // Visible options: all branches for managers; otherwise the intersection of
  // fetched branches with the caller's `branchIds` (defensive — the API
  // already filters, but the fetched list may still be empty while loading).
  const options = canManage ? branches : branches.filter((b) => branchIds.includes(b._id));

  // If the active branch isn't in the option list yet (e.g. first load or a
  // stale session value), auto-select the first available branch so pages
  // don't get stuck on "Selecciona una sucursal".
  useEffect(() => {
    if (options.length === 0) return;
    if (branchId && options.some((o) => o._id === branchId)) return;
    const first = options[0];
    if (first) setBranchId(first._id);
  }, [branchId, options, setBranchId]);

  if (options.length === 0) return null;

  // Single-branch non-manager: no dropdown, just a read-only chip. The Chip
  // also covers the "only one branch in the business" case for managers,
  // which keeps the header tidy for small deployments.
  if (options.length === 1) {
    const only = options[0]!;
    return <Chip size="small" label={`Sucursal: ${only.name}`} variant="outlined" />;
  }

  return (
    <FormControl size={size} sx={{ minWidth: 180 }}>
      <InputLabel id="active-branch-switcher-label">Sucursal</InputLabel>
      <Select
        labelId="active-branch-switcher-label"
        label="Sucursal"
        value={branchId ?? ''}
        onChange={(e) => {
          const next = e.target.value;
          if (typeof next === 'string' && next.length > 0) setBranchId(next);
        }}
      >
        {options.map((branch) => (
          <MenuItem key={branch._id} value={branch._id}>
            {branch.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
