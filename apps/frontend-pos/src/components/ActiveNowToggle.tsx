import { hasPermission, type UserRole } from '@kaipos/shared';
import { FormControlLabel, Switch } from '@kaipos/ui';

export interface ActiveNowToggleProps {
  role: UserRole | undefined;
  // `true` means "hide products outside their availability window" (the
  // default). The toggle inverts that: when ON, we want to *see* products
  // outside their window.
  hideUnavailable: boolean;
  onChange: (hideUnavailable: boolean) => void;
}

// Surfaced only for users who can manage the catalog. Cashiers should never
// see out-of-window products at all. `products:write` is the closest existing
// permission — it lives on admin/manager/super_admin per ROLE_PERMISSIONS.
export function ActiveNowToggle({ role, hideUnavailable, onChange }: ActiveNowToggleProps) {
  if (!role) return null;
  if (!hasPermission(role, 'products:write')) return null;

  return (
    <FormControlLabel
      control={
        <Switch
          checked={!hideUnavailable}
          onChange={(_, checked) => onChange(!checked)}
          slotProps={{
            input: {
              'aria-label': 'Ver fuera de horario',
              // `data-*` attributes are valid HTML but not in
              // InputHTMLAttributes — narrow cast keeps the rest of the props
              // type-checked.
              ...({ 'data-testid': 'active-now-toggle' } as Record<string, string>),
            },
          }}
        />
      }
      label="Ver fuera de horario"
      data-testid="active-now-toggle-label"
    />
  );
}
