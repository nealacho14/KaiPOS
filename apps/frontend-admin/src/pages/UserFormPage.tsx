import type { UserRole } from '@kaipos/shared';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  ChevronRight,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@kaipos/ui';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/index.js';
import { useAuth } from '../context/AuthContext.js';
import { useBranches, type BranchOption } from '../hooks/useBranches.js';
import {
  createUser,
  getUser,
  toUsersApiError,
  updateUser,
  type CreateUserPayload,
  type SafeUser,
  type UpdateUserPayload,
} from '../lib/users-api.js';

type Mode = 'new' | 'edit';

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  supervisor: 'Supervisor',
  cashier: 'Cajero',
  waiter: 'Mesero',
  kitchen: 'Cocina',
};

const ALL_ROLES: readonly UserRole[] = [
  'admin',
  'manager',
  'supervisor',
  'cashier',
  'waiter',
  'kitchen',
];

const MANAGER_ASSIGNABLE: ReadonlySet<UserRole> = new Set([
  'supervisor',
  'cashier',
  'waiter',
  'kitchen',
]);

const MIN_PASSWORD_LENGTH = 8;

interface FormState {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  branchIds: string[];
  isActive: boolean;
}

function initialForm(): FormState {
  return {
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
    role: 'cashier',
    branchIds: [],
    isActive: true,
  };
}

function userToForm(user: SafeUser): FormState {
  return {
    email: user.email,
    name: user.name,
    password: '',
    confirmPassword: '',
    role: user.role,
    branchIds: user.branchIds ?? [],
    isActive: user.isActive,
  };
}

function rolesAvailableTo(actorRole: UserRole | undefined): UserRole[] {
  if (!actorRole) return [];
  if (actorRole === 'super_admin') return [...ALL_ROLES];
  if (actorRole === 'manager') return ALL_ROLES.filter((r) => MANAGER_ASSIGNABLE.has(r));
  // admin & others: hide super_admin (UX guardrail; backend remains authoritative)
  return [...ALL_ROLES];
}

function validateClientSide(form: FormState, mode: Mode): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (!form.email.trim()) errors.email = 'El email es obligatorio.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errors.email = 'El email no parece válido.';
  if (!form.name.trim()) errors.name = 'El nombre es obligatorio.';
  if (mode === 'new') {
    if (form.password.length < MIN_PASSWORD_LENGTH)
      errors.password = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
    if (form.password !== form.confirmPassword)
      errors.confirmPassword = 'Las contraseñas no coinciden.';
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

export function UserFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const mode: Mode = id ? 'edit' : 'new';
  const { user: actor } = useAuth();
  const { branches, loading: branchesLoading } = useBranches();

  const [form, setForm] = useState<FormState>(initialForm);
  const [loadState, setLoadState] = useState<LoadState>(() =>
    mode === 'edit' ? { status: 'loading' } : { status: 'ready' },
  );
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Super_admin needs a target business; the picker lands in PR 7. Until then
  // we render a friendly notice and a back link instead of a half-functional
  // form. This bypass is intentional and not a permission decision —
  // permission enforcement remains backend-authoritative.
  const blockedForSuperAdmin = actor?.businessId === SUPER_ADMIN_BUSINESS_ID && mode === 'new';

  const availableRoles = useMemo(() => rolesAvailableTo(actor?.role), [actor?.role]);

  const updateForm = useCallback((patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    let cancelled = false;
    getUser(id)
      .then((user) => {
        if (cancelled) return;
        setForm(userToForm(user));
        setLoadState({ status: 'ready' });
      })
      .catch((err) => {
        if (cancelled) return;
        const mapped = toUsersApiError(err);
        const message =
          mapped.status === 404
            ? 'Este usuario no existe o no tienes acceso a él.'
            : mapped.status === 403
              ? 'No tienes permiso para ver este usuario.'
              : 'No pudimos cargar el usuario. Inténtalo de nuevo.';
        setLoadState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id, mode]);

  const handleSubmit = useCallback(async () => {
    const errors = validateClientSide(form, mode);
    if (errors) {
      setFieldErrors(errors);
      setSubmitError('Revisa los campos marcados y vuelve a intentarlo.');
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (mode === 'new') {
        const payload: CreateUserPayload = {
          email: form.email.trim(),
          password: form.password,
          name: form.name.trim(),
          role: form.role,
          ...(form.branchIds.length > 0 ? { branchIds: form.branchIds } : {}),
        };
        await createUser(payload);
      } else if (id) {
        const payload: UpdateUserPayload = {
          name: form.name.trim(),
          role: form.role,
          branchIds: form.branchIds,
          isActive: form.isActive,
        };
        await updateUser(id, payload);
      }
      navigate('/users');
    } catch (err) {
      const mapped = toUsersApiError(err);
      if (mapped.code === 'DUPLICATE_EMAIL') {
        setFieldErrors({ email: 'Ya existe un usuario con este email.' });
        setSubmitError('Corrige el email duplicado para continuar.');
      } else if (mapped.code === 'VALIDATION_ERROR' && mapped.details) {
        const next: Record<string, string> = {};
        for (const d of mapped.details) {
          if (d.field) next[d.field] = d.message;
        }
        setFieldErrors(next);
        setSubmitError('Revisa los campos marcados y vuelve a intentarlo.');
      } else if (mapped.status === 403) {
        setSubmitError('No tienes permiso para esta operación.');
      } else {
        setSubmitError(mapped.message || 'No pudimos guardar los cambios. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, id, mode, navigate]);

  if (blockedForSuperAdmin) {
    return (
      <>
        <PageHeader title="Nuevo usuario" />
        <Alert severity="info" sx={{ mb: 2 }}>
          Como super_admin necesitas seleccionar un negocio antes de crear usuarios. Esa función
          llegará en una próxima entrega; mientras tanto crea usuarios desde el negocio
          correspondiente.
        </Alert>
        <Button variant="outlined" component={RouterLink} to="/users">
          Volver al listado
        </Button>
      </>
    );
  }

  if (loadState.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadState.status === 'error') {
    return (
      <>
        <PageHeader title="Editar usuario" />
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="error" sx={{ width: '100%' }}>
            {loadState.message}
          </Alert>
          <Button variant="outlined" component={RouterLink} to="/users">
            Volver al listado
          </Button>
        </Stack>
      </>
    );
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 3 }}
      >
        <Breadcrumb name={form.name} mode={mode} />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" component={RouterLink} to="/users">
            Cancelar
          </Button>
          <Button size="small" variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : mode === 'new' ? 'Crear usuario' : 'Guardar cambios'}
          </Button>
        </Stack>
      </Stack>

      {submitError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>No pudimos guardar</AlertTitle>
          {submitError}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 360px' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Stack spacing={3}>
          <BasicInfoCard
            form={form}
            updateForm={updateForm}
            fieldErrors={fieldErrors}
            mode={mode}
          />

          {mode === 'new' && (
            <PasswordCard form={form} updateForm={updateForm} fieldErrors={fieldErrors} />
          )}

          <RoleAndBranchesCard
            form={form}
            updateForm={updateForm}
            availableRoles={availableRoles}
            branches={branches}
            branchesLoading={branchesLoading}
          />

          {mode === 'edit' && <StatusCard form={form} updateForm={updateForm} />}
        </Stack>

        <Box
          sx={{
            position: { md: 'sticky' },
            top: { md: 16 },
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <SummaryCard
            role={form.role}
            branchCount={form.branchIds.length}
            isActive={form.isActive}
          />
        </Box>
      </Box>
    </Box>
  );
}

function Breadcrumb({ name, mode }: { name: string; mode: Mode }) {
  const last = name || (mode === 'new' ? 'Nuevo usuario' : 'Sin nombre');
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
      <Typography
        component={RouterLink}
        to="/users"
        variant="subtitle2"
        sx={{ color: 'text.secondary', textDecoration: 'none' }}
      >
        ← Usuarios
      </Typography>
      <ChevronRight size={14} aria-hidden />
      <Typography variant="subtitle2" sx={{ color: 'text.primary' }}>
        {last}
      </Typography>
    </Stack>
  );
}

interface CardSlotProps {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
  fieldErrors: Record<string, string>;
}

function BasicInfoCard({ form, updateForm, fieldErrors, mode }: CardSlotProps & { mode: Mode }) {
  const nameId = useId();
  const emailId = useId();
  return (
    <Card variant="outlined">
      <CardHeader title="Información básica" />
      <CardContent>
        <Stack spacing={2}>
          <TextField
            id={nameId}
            label="Nombre"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            error={Boolean(fieldErrors.name)}
            helperText={fieldErrors.name ?? ' '}
            required
            fullWidth
          />
          <TextField
            id={emailId}
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => updateForm({ email: e.target.value })}
            error={Boolean(fieldErrors.email)}
            helperText={
              fieldErrors.email ?? (mode === 'edit' ? 'El email no se puede cambiar.' : ' ')
            }
            required
            fullWidth
            disabled={mode === 'edit'}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

function PasswordCard({ form, updateForm, fieldErrors }: CardSlotProps) {
  const passwordId = useId();
  const confirmId = useId();
  return (
    <Card variant="outlined">
      <CardHeader title="Contraseña inicial" />
      <CardContent>
        <Stack spacing={2}>
          <TextField
            id={passwordId}
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => updateForm({ password: e.target.value })}
            error={Boolean(fieldErrors.password)}
            helperText={fieldErrors.password ?? `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
            required
            fullWidth
          />
          <TextField
            id={confirmId}
            label="Confirmar contraseña"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => updateForm({ confirmPassword: e.target.value })}
            error={Boolean(fieldErrors.confirmPassword)}
            helperText={fieldErrors.confirmPassword ?? ' '}
            required
            fullWidth
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

function RoleAndBranchesCard({
  form,
  updateForm,
  availableRoles,
  branches,
  branchesLoading,
}: {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
  availableRoles: UserRole[];
  branches: BranchOption[];
  branchesLoading: boolean;
}) {
  const roleId = useId();
  const toggleBranch = (id: string) => {
    const next = form.branchIds.includes(id)
      ? form.branchIds.filter((b) => b !== id)
      : [...form.branchIds, id];
    updateForm({ branchIds: next });
  };

  // If the persisted role isn't in the actor's allowable set (e.g. an admin
  // editing another admin), still show it disabled so the form doesn't lie.
  const roleOptions = availableRoles.includes(form.role)
    ? availableRoles
    : [form.role, ...availableRoles];

  return (
    <Card variant="outlined">
      <CardHeader title="Rol y sucursales" />
      <CardContent>
        <Stack spacing={3}>
          <FormControl fullWidth>
            <InputLabel id={roleId}>Rol</InputLabel>
            <Select
              labelId={roleId}
              label="Rol"
              value={form.role}
              onChange={(e) => updateForm({ role: e.target.value as UserRole })}
            >
              {roleOptions.map((role) => (
                <MenuItem key={role} value={role}>
                  {ROLE_LABEL[role]}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              Los managers solo pueden asignar supervisor, cajero, mesero o cocina.
            </FormHelperText>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Sucursales asignadas
            </Typography>
            {branchesLoading ? (
              <Typography variant="body2" color="text.secondary">
                Cargando sucursales…
              </Typography>
            ) : branches.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Aún no hay sucursales en este negocio.
              </Typography>
            ) : (
              <Stack>
                {branches.map((branch) => (
                  <FormControlLabel
                    key={branch._id}
                    control={
                      <Checkbox
                        checked={form.branchIds.includes(branch._id)}
                        onChange={() => toggleBranch(branch._id)}
                      />
                    }
                    label={branch.name}
                  />
                ))}
              </Stack>
            )}
            <FormHelperText>
              Si no se asigna ninguna sucursal, el usuario verá todas las sucursales que su rol
              permita.
            </FormHelperText>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function StatusCard({
  form,
  updateForm,
}: {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
}) {
  return (
    <Card variant="outlined">
      <CardHeader title="Estado" />
      <CardContent>
        <FormControlLabel
          control={
            <Switch
              checked={form.isActive}
              onChange={(e) => updateForm({ isActive: e.target.checked })}
            />
          }
          label={form.isActive ? 'Cuenta activa' : 'Cuenta desactivada'}
        />
        <FormHelperText>
          Un usuario desactivado no puede iniciar sesión. La cuenta se conserva para auditoría.
        </FormHelperText>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  role,
  branchCount,
  isActive,
}: {
  role: UserRole;
  branchCount: number;
  isActive: boolean;
}) {
  return (
    <Card variant="outlined">
      <CardHeader title="Resumen" />
      <CardContent>
        <Stack spacing={1.5}>
          <SummaryRow label="Rol">
            <Chip size="small" color="primary" label={ROLE_LABEL[role]} />
          </SummaryRow>
          <SummaryRow label="Sucursales">
            <Typography variant="subtitle2">
              {branchCount === 0 ? 'Todas las permitidas' : `${branchCount} asignadas`}
            </Typography>
          </SummaryRow>
          <SummaryRow label="Estado">
            <Chip
              size="small"
              variant={isActive ? 'filled' : 'outlined'}
              color={isActive ? 'success' : 'default'}
              label={isActive ? 'Activo' : 'Inactivo'}
            />
          </SummaryRow>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      {children}
    </Stack>
  );
}
