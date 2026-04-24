import { hasPermission } from '@kaipos/shared';
import { Chip, FormControl, InputLabel, MenuItem, Select, type SelectProps } from '@kaipos/ui';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { ApiError, apiJson } from '../lib/api.js';

// The backend does not yet expose `/api/branches` — see follow-up
// `products-crud › branches-endpoint`. Until then, the selector falls back
// to the ids carried on the JWT (`user.branchIds`) and displays them as
// raw ids.
interface BranchOption {
  _id: string;
  name: string;
}

interface BranchesResponse {
  branches: BranchOption[];
}

export interface BranchSelectorProps {
  value: string | null;
  onChange: (branchId: string) => void;
  label?: string;
  size?: SelectProps['size'];
}

export function BranchSelector({
  value,
  onChange,
  label = 'Sucursal',
  size = 'small',
}: BranchSelectorProps) {
  const { user } = useAuth();
  const canManage = user ? hasPermission(user.role, 'branches:manage') : false;
  const fallbackIds = useMemo(() => user?.branchIds ?? [], [user?.branchIds]);

  const [options, setOptions] = useState<BranchOption[]>(() =>
    fallbackIds.map((id) => ({ _id: id, name: id })),
  );

  useEffect(() => {
    let cancelled = false;
    apiJson<BranchesResponse>('/api/branches')
      .then((data) => {
        if (cancelled) return;
        // Non-managers still see only the branches carried on their token —
        // the endpoint is authoritative, but we keep the client-side filter
        // as a defensive net until the server guarantees this.
        const filtered = canManage
          ? data.branches
          : data.branches.filter((b) => fallbackIds.includes(b._id));
        setOptions(filtered);
      })
      .catch((err: unknown) => {
        // 404 is the expected case while the endpoint does not exist yet —
        // any other error is logged so it does not silently degrade UX.
        if (!(err instanceof ApiError) || err.status !== 404) {
          // eslint-disable-next-line no-console
          console.warn('Failed to load branches, falling back to ids', err);
        }
        if (cancelled) return;
        setOptions(fallbackIds.map((id) => ({ _id: id, name: id })));
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, fallbackIds]);

  // Single-branch user without cross-branch privileges: show a readonly chip
  // rather than a pointless dropdown.
  if (!canManage && fallbackIds.length === 1) {
    const only = options[0] ?? { _id: fallbackIds[0] ?? '', name: fallbackIds[0] ?? '' };
    return (
      <Chip
        size={size === 'small' ? 'small' : 'medium'}
        label={`${label}: ${only.name}`}
        variant="outlined"
      />
    );
  }

  const selectValue = value ?? '';

  return (
    <FormControl size={size} sx={{ minWidth: 200 }}>
      <InputLabel id="branch-selector-label">{label}</InputLabel>
      <Select
        labelId="branch-selector-label"
        label={label}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (typeof next === 'string' && next.length > 0) onChange(next);
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
