import {
  Alert,
  Box,
  Button,
  CircularProgress,
  KaiPOSLogo,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@kaipos/ui';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ApiError, apiJson } from '../lib/api.js';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function ForgotPasswordPage() {
  const theme = useTheme();
  const emailId = useId();
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage(null);

    try {
      await apiJson('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
        skipAuth: true,
      });
      setStatus('success');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.code === 'VALIDATION_ERROR'
            ? 'Revisa el email ingresado.'
            : 'Algo salió mal. Inténtalo de nuevo.'
          : err instanceof TypeError
            ? 'No pudimos conectar. Revisa tu conexión.'
            : 'Algo salió mal. Inténtalo de nuevo.';
      setErrorMessage(message);
      setStatus('error');
    }
  }

  const submitting = status === 'submitting';

  return (
    <CenteredAuthLayout>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
        <KaiPOSLogo variant="horizontal" colorVariant="color" size="md" />
      </Stack>

      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 650,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'text.secondary',
        }}
      >
        Recuperación de cuenta
      </Typography>
      <Typography
        component="h1"
        sx={{
          fontSize: { xs: 26, md: 32 },
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          margin: '8px 0 16px',
        }}
      >
        ¿Olvidaste tu contraseña?
      </Typography>
      <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 3 }}>
        Ingresa el correo asociado a tu cuenta y te enviaremos un enlace para restablecerla.
      </Typography>

      {status === 'success' ? (
        <Alert severity="success" sx={{ mb: 3 }} role="status">
          Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa
          tu bandeja de entrada (y la carpeta de spam) en los próximos minutos.
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
                disabled={submitting}
              />

              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                disabled={submitting || !email}
                sx={{ minHeight: 48, borderRadius: `${theme.radii.md}px` }}
              >
                {submitting ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  'Enviar enlace de recuperación'
                )}
              </Button>
            </Stack>
          </Box>
        </>
      )}

      <Box sx={{ mt: 3, fontSize: 13, color: 'text.secondary' }}>
        ¿Ya la recordaste?{' '}
        <Box
          component={RouterLink}
          to="/login"
          sx={{
            color: 'primary.main',
            fontWeight: 600,
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          Volver al inicio de sesión
        </Box>
      </Box>
    </CenteredAuthLayout>
  );
}

export function CenteredAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        bgcolor: 'background.default',
        color: 'text.primary',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { xs: '28px 20px', md: '48px' },
      }}
    >
      <Box sx={{ maxWidth: 440, width: '100%' }}>{children}</Box>
    </Box>
  );
}
