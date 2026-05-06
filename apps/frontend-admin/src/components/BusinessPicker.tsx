import { FormControl, InputLabel, MenuItem, Select } from '@kaipos/ui';
import { useEffect, useState } from 'react';
import { ApiError, apiJson } from '../lib/api.js';
import { getSelectedBusinessId, setSelectedBusinessId } from '../lib/auth-storage.js';

interface BusinessSummary {
  _id: string;
  name: string;
  slug: string;
}

// Header-mounted picker for super_admin only. On mount, fetches the visible
// businesses; persists the selection to localStorage and broadcasts a custom
// event so the api client picks up the new `x-business-id` value on the next
// request without a full page reload.
export function BusinessPicker() {
  const [businesses, setBusinesses] = useState<BusinessSummary[] | null>(null);
  const [selected, setSelected] = useState<string>(() => getSelectedBusinessId() ?? '');

  useEffect(() => {
    let cancelled = false;
    apiJson<BusinessSummary[]>('/api/businesses')
      .then((data) => {
        if (cancelled) return;
        setBusinesses(data);
        // Auto-select the first business if none picked yet (super_admin
        // shouldn't see queries blow up on first load just because they
        // haven't touched the dropdown).
        if (!selected && data.length > 0) {
          setSelected(data[0]._id);
          setSelectedBusinessId(data[0]._id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (!(err instanceof ApiError)) return;
        // 403 — not super_admin. Should not happen since the parent gates on role,
        // but fail closed to an empty list rather than spamming the console.
        setBusinesses([]);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount; selection is local state from there.
  }, [selected]);

  if (!businesses || businesses.length === 0) return null;

  return (
    <FormControl size="small" sx={{ minWidth: 220 }}>
      <InputLabel id="business-picker-label">Negocio</InputLabel>
      <Select
        labelId="business-picker-label"
        label="Negocio"
        value={selected}
        onChange={(e) => {
          const next = typeof e.target.value === 'string' ? e.target.value : '';
          setSelected(next);
          setSelectedBusinessId(next || null);
          // Force a clean reload so cached data (products, branches, etc.)
          // refetch under the new tenant scope. Cheaper and less error-prone
          // than fanning out an invalidate event to every consumer.
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }}
      >
        {businesses.map((b) => (
          <MenuItem key={b._id} value={b._id}>
            {b.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
