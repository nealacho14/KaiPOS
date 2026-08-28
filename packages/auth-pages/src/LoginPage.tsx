import {
  Alert,
  alpha,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Eye,
  EyeOff,
  fontWeight,
  FormControlLabel,
  IconButton,
  KaiPOSLogo,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@kaipos/ui';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, useAuth } from '@kaipos/app-runtime';

type Status = 'idle' | 'submitting' | 'error';

interface LocationState {
  from?: { pathname?: string };
}

export interface LoginPageProps {
  // Where to send the user after a successful login when there is no
  // `state.from` to return to. Per-app: admin → "/dashboard", POS → "/".
  defaultRedirectPath: string;
  // Build-time version string shown in the footer. Each host app reads its
  // own `import.meta.env.VITE_APP_VERSION` and passes it in — this lib does
  // not touch Vite-specific globals so it can be type-checked standalone.
  appVersion?: string;
}

function mapErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Email o contraseña incorrectos.';
    if (err.status === 429 || err.code === 'ACCOUNT_LOCKED') {
      return 'Cuenta temporalmente bloqueada. Intenta de nuevo en unos minutos.';
    }
    if (err.status === 400 || err.code === 'VALIDATION_ERROR') {
      return 'Revisa los campos marcados.';
    }
    return 'Algo salió mal. Inténtalo de nuevo.';
  }
  if (err instanceof TypeError) {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.';
  }
  return 'Algo salió mal. Inténtalo de nuevo.';
}

export function LoginPage({ defaultRedirectPath, appVersion }: LoginPageProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const version = appVersion ?? '0.0.0';

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (status === 'error') {
      alertRef.current?.focus();
    }
  }, [status, errorMessage]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage(null);
    setFieldErrors({});

    try {
      await login(email, password, remember);
      const dest = (location.state as LocationState | null)?.from?.pathname ?? defaultRedirectPath;
      navigate(dest, { replace: true });
    } catch (err) {
      const message = mapErrorMessage(err);
      const next: Record<string, string> = {};
      if (err instanceof ApiError && err.details) {
        for (const d of err.details) {
          next[d.field] = d.message;
        }
      }
      setFieldErrors(next);
      setErrorMessage(message);
      setStatus('error');
    }
  }

  const submitting = status === 'submitting';
  const onPrimary = theme.palette.common.white;

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        width: '100%',
        bgcolor: 'background.default',
        color: 'text.primary',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
      }}
    >
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'primary.dark',
          color: onPrimary,
          flexDirection: 'column',
          px: { md: 14 },
          py: { md: 12 },
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(${alpha(onPrimary, 0.04)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(onPrimary, 0.04)} 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
            pointerEvents: 'none',
          }}
        />

        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ position: 'relative', zIndex: 1 }}
        >
          <KaiPOSLogo variant="horizontal" colorVariant="white" size="md" />
          <Typography
            component="span"
            variant="overline"
            sx={{
              ml: 1,
              px: 1,
              py: 0.375,
              borderRadius: `${theme.radii.xs}px`,
              bgcolor: alpha(onPrimary, 0.12),
              color: alpha(onPrimary, 0.85),
            }}
          >
            Merchant
          </Typography>
        </Stack>

        <Box sx={{ marginTop: 'auto', position: 'relative', zIndex: 1 }}>
          <Typography variant="overline" sx={{ color: alpha(onPrimary, 0.65) }}>
            Panel de administración
          </Typography>
          <Typography component="h1" variant="h2" sx={{ mt: 1.5, mb: 2 }}>
            Un solo lugar
            <br />
            para tu servicio.
          </Typography>
          <Typography
            variant="subtitle1"
            sx={{ color: alpha(onPrimary, 0.75), maxWidth: 420, m: 0 }}
          >
            Menú, inventario, turnos, reportes y tienda online — conectados en tiempo real a cada
            terminal, cocina y mesero.
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          px: { xs: 2.5, md: 6 },
          py: { xs: 3.5, md: 12 },
          overflow: 'auto',
        }}
      >
        <Box sx={{ m: 'auto', width: '100%', maxWidth: 420 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
            Bienvenido de vuelta
          </Typography>
          <Typography component="h2" variant="h3" sx={{ mt: 1, mb: 3.5 }}>
            Inicia sesión en tu panel
          </Typography>

          {errorMessage && (
            <Alert
              ref={alertRef}
              severity="error"
              tabIndex={-1}
              role="alert"
              aria-live="polite"
              sx={{ mb: 2.5, outline: 'none' }}
            >
              {errorMessage}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
              <TextField
                inputRef={emailRef}
                id={emailId}
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                error={Boolean(fieldErrors.email)}
                helperText={fieldErrors.email ?? ' '}
                disabled={submitting}
              />

              <Box>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                  sx={{ mb: 0.75 }}
                >
                  <Typography
                    component="label"
                    htmlFor={passwordId}
                    variant="body2"
                    sx={{ fontWeight: theme.typography.fontWeightMedium, color: 'text.primary' }}
                  >
                    Contraseña
                  </Typography>
                  <Typography
                    component={RouterLink}
                    to="/forgot-password"
                    variant="caption"
                    sx={{
                      color: 'primary.main',
                      fontWeight: fontWeight.semibold,
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    ¿Olvidaste?
                  </Typography>
                </Stack>

                <Box sx={{ position: 'relative' }}>
                  <TextField
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    fullWidth
                    error={Boolean(fieldErrors.password)}
                    helperText={fieldErrors.password ?? ' '}
                    disabled={submitting}
                    slotProps={{ htmlInput: { style: { paddingRight: 48 } } }}
                  />
                  <IconButton
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((v) => !v)}
                    sx={{ position: 'absolute', right: 6, top: 8 }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </IconButton>
                </Box>
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={submitting}
                    color="primary"
                  />
                }
                label="Mantener sesión en este dispositivo (30 días)"
                slotProps={{ typography: { variant: 'body2' } }}
                sx={{ color: 'text.secondary' }}
              />

              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                disabled={submitting}
                sx={{ minHeight: theme.posSize.min, borderRadius: `${theme.radii.md}px` }}
              >
                {submitting ? <CircularProgress size={18} color="inherit" /> : 'Iniciar sesión'}
              </Button>
            </Stack>
          </Box>
        </Box>

        <Stack
          direction="row"
          spacing={2}
          sx={{
            mt: 5,
            pt: 2.5,
            width: '100%',
            maxWidth: 420,
            borderTop: '1px solid',
            borderColor: 'divider',
            color: 'text.disabled',
            flexWrap: 'wrap',
          }}
        >
          <Typography
            variant="caption"
            sx={{ ml: 'auto', fontFamily: theme.typography.mono.fontFamily }}
          >
            v {version}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
