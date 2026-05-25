import { clearSession } from '@kaipos/app-runtime';
import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouter from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage.js';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderAt(url: string) {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={[url]}>
        <ResetPasswordPage />
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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  clearSession();
});

describe('ResetPasswordPage', () => {
  it('shows a guidance alert when the URL has no token', () => {
    renderAt('/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent(/falta el token/i);
  });

  it('submits the new password and redirects to /login', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { success: true, data: { message: 'ok' } }));

    renderAt('/reset-password?token=tok-123');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpass1234');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'newpass1234');
    await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/contraseña se actualizó/i);
    });

    expect(JSON.parse((fetchMock.mock.calls[0][1]?.body as string) ?? '{}')).toEqual({
      token: 'tok-123',
      password: 'newpass1234',
    });

    vi.advanceTimersByTime(2000);
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('blocks submission and shows mismatch error when passwords differ', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    renderAt('/reset-password?token=tok-123');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpass1234');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'differentpass');
    await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/las contraseñas no coinciden/i)).toBeInTheDocument();
  });

  it('maps EXPIRED_RESET_TOKEN to the expired-link copy', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, {
        success: false,
        error: 'expired',
        code: 'EXPIRED_RESET_TOKEN',
      }),
    );

    renderAt('/reset-password?token=tok-123');
    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpass1234');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'newpass1234');
    await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/el enlace expiró/i);
  });
});
