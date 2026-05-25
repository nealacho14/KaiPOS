import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Eye,
  EyeOff,
  fontWeight,
  IconButton,
  KaiPOSLogo,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@kaipos/ui';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiJson } from '../lib/api.js';
import { CenteredAuthLayout } from './ForgotPasswordPage.js';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const MIN_PASSWORD_LENGTH = 8;

function mapErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_RESET_TOKEN') {
      return 'El enlace no es válido. Solicita uno nuevo.';
    }
    if (err.code === 'EXPIRED_RESET_TOKEN') {
      return 'El enlace expiró. Solicita uno nuevo.';
    }
    if (err.code === 'USED_RESET_TOKEN') {
      return 'Este enlace ya se usó. Solicita uno nuevo.';
    }
    if (err.code === 'VALIDATION_ERROR') {
      return 'Revisa los campos marcados.';
    }
    return 'Algo salió mal. Inténtalo de nuevo.';
  }
  if (err instanceof TypeError) {
    return 'No pudimos conectar. Revisa tu conexión.';
  }
  return 'Algo salió mal. Inténtalo de nuevo.';
}

export function ResetPasswordPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const passwordId = useId();
  const confirmId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setConfirmError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      setStatus('error');
      return;
    }
    if (password !== confirm) {
      setConfirmError('Las contraseñas no coinciden.');
      setStatus('error');
      return;
    }

    setStatus('submitting');

    try {
      await apiJson('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
        skipAuth: true,
      });
      setStatus('success');
      // Brief pause so the user sees the success state before redirecting
      window.setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1800);
    } catch (err) {
      setErrorMessage(mapErrorMessage(err));
      setStatus('error');
    }
  }

  const submitting = status === 'submitting';
  const success = status === 'success';
  const tokenMissing = !token;

  return (
    <CenteredAuthLayout>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
        <KaiPOSLogo variant="horizontal" colorVariant="color" size="md" />
      </Stack>

      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        Restablecer contraseña
      </Typography>
      <Typography component="h1" variant="h3" sx={{ mt: 1, mb: 2 }}>
        Define una nueva contraseña
      </Typography>

      {tokenMissing ? (
        <Alert severity="error" role="alert">
          Falta el token de restablecimiento en la URL. Pide un nuevo enlace desde{' '}
          <Typography
            component={RouterLink}
            to="/forgot-password"
            sx={{
              color: 'inherit',
              fontWeight: fontWeight.semibold,
            }}
          >
            ¿Olvidaste tu contraseña?
          </Typography>
          .
        </Alert>
      ) : success ? (
        <Alert severity="success" role="status">
          Tu contraseña se actualizó. Te llevamos al inicio de sesión…
        </Alert>
      ) : (
        <>
          {errorMessage && (
            <Alert severity="error" sx={{ mb: 2.5 }} role="alert">
              {errorMessage}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
              <Box sx={{ position: 'relative' }}>
                <TextField
                  inputRef={passwordRef}
                  id={passwordId}
                  label="Nueva contraseña"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  fullWidth
                  disabled={submitting}
                  helperText={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
                  slotProps={{ htmlInput: { style: { paddingRight: 48 } } }}
                />
                <IconButton
                  type="button"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((v) => !v)}
                  sx={{ position: 'absolute', right: 6, top: 22 }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </IconButton>
              </Box>

              <TextField
                id={confirmId}
                label="Confirmar contraseña"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                fullWidth
                disabled={submitting}
                error={Boolean(confirmError)}
                helperText={confirmError ?? ' '}
              />

              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                disabled={submitting || !password || !confirm}
                sx={{ minHeight: theme.posSize.min, borderRadius: `${theme.radii.md}px` }}
              >
                {submitting ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  'Actualizar contraseña'
                )}
              </Button>
            </Stack>
          </Box>
        </>
      )}

      <Typography variant="body2" sx={{ mt: 3, color: 'text.secondary' }}>
        <Typography
          component={RouterLink}
          to="/login"
          variant="body2"
          sx={{
            color: 'primary.main',
            fontWeight: fontWeight.semibold,
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          ← Volver al inicio de sesión
        </Typography>
      </Typography>
    </CenteredAuthLayout>
  );
}
