import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouter from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.js';
import { clearSession } from '../lib/auth-storage.js';
import { LoginPage } from './LoginPage.js';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderLogin() {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </KaiPOSThemeProvider>,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  clearSession();
  navigateMock.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  clearSession();
});

describe('LoginPage', () => {
  it('happy path: submits, stores session, navigates to /dashboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/login') {
        return jsonResponse(200, {
          success: true,
          data: {
            accessToken: 'a',
            refreshToken: 'r',
            user: {
              _id: 'u1',
              businessId: 'b1',
              email: 'admin@x.com',
              name: 'Admin',
              role: 'admin',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'system',
            },
          },
        });
      }
      if (url === '/api/auth/me') {
        return jsonResponse(200, {
          success: true,
          data: {
            user: {
              _id: 'u1',
              businessId: 'b1',
              email: 'admin@x.com',
              name: 'Admin',
              role: 'admin',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'system',
            },
            business: { _id: 'b1', name: 'Biz', slug: 'biz' },
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'admin@x.com');
    await user.type(screen.getByLabelText('Contraseña'), 'secret');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('renders 401 alert with mapped copy on bad credentials', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { success: false, error: 'bad', code: 'UNAUTHORIZED' }),
    );

    renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText('Contraseña'), 'x');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/email o contraseña incorrectos/i);
  });

  it('renders 429 alert with lockout copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(429, { success: false, error: 'locked', code: 'ACCOUNT_LOCKED' }),
    );

    renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText('Contraseña'), 'x');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cuenta temporalmente bloqueada/i);
  });

  it('renders network-error copy when fetch throws', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText('Contraseña'), 'x');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no pudimos conectar/i);
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(password.type).toBe('password');

    await user.click(screen.getByRole('button', { name: /mostrar contraseña/i }));
    expect(password.type).toBe('text');

    await user.click(screen.getByRole('button', { name: /ocultar contraseña/i }));
    expect(password.type).toBe('password');
  });
});
