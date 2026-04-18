import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  Eye,
  EyeOff,
  FormControlLabel,
  IconButton,
  KaiPOSLogo,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@kaipos/ui';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../lib/api.js';

type Status = 'idle' | 'submitting' | 'error';

interface LocationState {
  from?: { pathname?: string };
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

export function LoginPage() {
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

  const version = import.meta.env.VITE_APP_VERSION ?? '0.0.0';

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
      await login(email, password);
      const dest = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard';
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

  return (
    <Box
      sx={{
        minHeight: '100vh',
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
          color: '#fff',
          flexDirection: 'column',
          padding: { md: '48px 56px' },
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
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
          <Box
            component="span"
            sx={{
              ml: 1,
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '3px 8px',
              borderRadius: `${theme.radii.xs}px`,
              bgcolor: 'rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            Merchant
          </Box>
        </Stack>

        <Box sx={{ marginTop: 'auto', position: 'relative', zIndex: 1 }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.65)',
            }}
          >
            Panel de administración
          </Typography>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 32, md: 44 },
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.12,
              margin: '14px 0 16px',
            }}
          >
            Un solo lugar
            <br />
            para tu servicio.
          </Typography>
          <Typography
            sx={{
              fontSize: 16,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,0.75)',
              maxWidth: 420,
              margin: 0,
            }}
          >
            Menú, inventario, turnos, reportes y tienda online — conectados en tiempo real a cada
            terminal, cocina y mesero.
          </Typography>

          <Box
            sx={{
              marginTop: 4,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 3,
              paddingTop: 3,
              borderTop: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <Stat value="12,400+" label="restaurantes" />
            <Stat value="$2.4B" label="procesado / año" />
            <Stat value="99.99%" label="uptime" />
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          padding: { xs: '28px 20px', md: '48px 56px' },
          overflow: 'auto',
        }}
      >
        <Box sx={{ marginLeft: 'auto', fontSize: 13, color: 'text.secondary' }}>
          ¿Nuevo en kaiPOS?{' '}
          <Box
            component="a"
            href="#"
            sx={{
              color: 'primary.main',
              fontWeight: 600,
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            Crea una cuenta →
          </Box>
        </Box>

        <Box sx={{ margin: 'auto 0', maxWidth: 420, width: '100%' }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 650,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            Bienvenido de vuelta
          </Typography>
          <Typography
            component="h2"
            sx={{
              fontSize: { xs: 26, md: 32 },
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              margin: '8px 0 28px',
            }}
          >
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

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1.25,
              marginBottom: 2.5,
            }}
          >
            <Tooltip title="Próximamente">
              <span>
                <Button variant="outlined" disabled fullWidth sx={{ minHeight: 44 }}>
                  Continuar con Google
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Próximamente">
              <span>
                <Button variant="outlined" disabled fullWidth sx={{ minHeight: 44 }}>
                  Continuar con Apple
                </Button>
              </span>
            </Tooltip>
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'text.disabled',
              margin: '4px 0 20px',
            }}
          >
            <Divider sx={{ flex: 1 }} />
            <span>o con email</span>
            <Divider sx={{ flex: 1 }} />
          </Stack>

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
                  <Box
                    component="label"
                    htmlFor={passwordId}
                    sx={{ fontSize: 13, fontWeight: 550, color: 'text.primary' }}
                  >
                    Contraseña
                  </Box>
                  <Box
                    component="a"
                    href="#"
                    sx={{
                      fontSize: 12,
                      color: 'primary.main',
                      fontWeight: 600,
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    ¿Olvidaste?
                  </Box>
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
                    sx={{
                      position: 'absolute',
                      right: 6,
                      top: 8,
                    }}
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
                sx={{ color: 'text.secondary', fontSize: 13 }}
              />

              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                disabled={submitting}
                sx={{ minHeight: 48, borderRadius: `${theme.radii.md}px` }}
              >
                {submitting ? <CircularProgress size={18} color="inherit" /> : 'Iniciar sesión'}
              </Button>
            </Stack>
          </Box>

          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{
              mt: 2.5,
              padding: 1.75,
              borderRadius: `${theme.radii.md}px`,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              color: 'text.secondary',
              fontSize: 13,
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: `${theme.radii.sm}px`,
                bgcolor: 'rgba(11, 122, 117, 0.12)',
                color: 'primary.main',
                display: 'grid',
                placeItems: 'center',
                fontSize: 15,
                flexShrink: 0,
              }}
            >
              ⌘
            </Box>
            <Box>
              <Box sx={{ color: 'text.primary', fontWeight: 600 }}>¿Eres miembro del staff?</Box>
              <Box>Ingresa directamente en la terminal con tu PIN de 4 dígitos.</Box>
            </Box>
          </Stack>
        </Box>

        <Stack
          direction="row"
          spacing={2}
          sx={{
            mt: 5,
            pt: 2.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            fontSize: 12,
            color: 'text.disabled',
            flexWrap: 'wrap',
          }}
        >
          <Box component="a" href="#" sx={{ color: 'inherit', textDecoration: 'none' }}>
            Términos
          </Box>
          <Box component="a" href="#" sx={{ color: 'inherit', textDecoration: 'none' }}>
            Privacidad
          </Box>
          <Box component="a" href="#" sx={{ color: 'inherit', textDecoration: 'none' }}>
            Estado del sistema
          </Box>
          <Typography variant="mono" sx={{ marginLeft: 'auto' }}>
            v {version}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Box>
      <Typography
        variant="money"
        sx={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', display: 'block' }}
      >
        {value}
      </Typography>
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.6)',
          marginTop: '2px',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
