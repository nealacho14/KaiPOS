import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { clearSession } from '../lib/auth-storage.js';
import { ForgotPasswordPage } from './ForgotPasswordPage.js';

function renderPage() {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
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
  vi.restoreAllMocks();
});

afterEach(() => {
  clearSession();
});

describe('ForgotPasswordPage', () => {
  it('submits the email and shows the generic success message', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { success: true, data: { message: 'ok' } }));

    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'someone@x.com');
    await user.click(screen.getByRole('button', { name: /enviar enlace/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/si el correo está registrado/i);
    });

    expect(fetchMock).toHaveBeenCalled();
    const [input, init] = fetchMock.mock.calls[0];
    expect(typeof input === 'string' ? input : (input as URL).toString()).toBe(
      '/api/auth/forgot-password',
    );
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({ email: 'someone@x.com' });
  });

  it('shows an error alert when the request fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(500, { success: false, error: 'boom', code: 'INTERNAL' }),
    );

    renderPage();
    await user.type(screen.getByLabelText(/email/i), 'someone@x.com');
    await user.click(screen.getByRole('button', { name: /enviar enlace/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/algo salió mal/i);
  });
});
