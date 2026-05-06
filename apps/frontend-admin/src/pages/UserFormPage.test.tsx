import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouter from 'react-router-dom';
import { setSession } from '../lib/auth-storage.js';
import { AuthProvider } from '../context/AuthContext.js';
import { UserFormPage } from './UserFormPage.js';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const adminUser = {
  _id: 'admin-1',
  businessId: 'biz-1',
  email: 'admin@x.com',
  name: 'Admin',
  role: 'admin' as const,
  branchIds: ['branch-1'],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'system',
};

function seedAdminSession() {
  setSession({ accessToken: 'a', refreshToken: 'r', user: adminUser });
}

function renderAt(url: string) {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={[url]}>
        <AuthProvider>
          <Routes>
            <Route path="/users/new" element={<UserFormPage />} />
            <Route path="/users/:id/edit" element={<UserFormPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </KaiPOSThemeProvider>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('UserFormPage (create)', () => {
  it('submits a valid create form and navigates back to /users', async () => {
    seedAdminSession();
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/me') {
        return jsonResponse(200, {
          success: true,
          data: { user: adminUser, business: { _id: 'biz-1', name: 'Biz', slug: 'biz' } },
        });
      }
      if (url === '/api/branches') {
        return jsonResponse(200, {
          success: true,
          data: { branches: [{ _id: 'branch-1', name: 'Centro' }] },
        });
      }
      if (url === '/api/users') {
        return jsonResponse(201, {
          success: true,
          data: { ...adminUser, _id: 'u-new', email: 'new@x.com', name: 'New' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt('/users/new');

    await user.type(screen.getByLabelText(/^nombre/i), 'Carla Cajera');
    await user.type(screen.getByLabelText(/^email/i), 'carla@x.com');
    await user.type(screen.getByLabelText(/^contraseña/i), 'supersecret1');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'supersecret1');

    await user.click(screen.getByRole('button', { name: /crear usuario/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/users');
    });

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        (typeof input === 'string' ? input : (input as URL).toString()) === '/api/users' &&
        init?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    const body = JSON.parse((createCall![1]?.body as string) ?? '{}');
    expect(body).toMatchObject({
      email: 'carla@x.com',
      name: 'Carla Cajera',
      password: 'supersecret1',
      role: 'cashier',
    });
  });

  it('maps DUPLICATE_EMAIL 409 detail to a field-level email error', async () => {
    seedAdminSession();
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/me') {
        return jsonResponse(200, {
          success: true,
          data: { user: adminUser, business: { _id: 'biz-1', name: 'Biz', slug: 'biz' } },
        });
      }
      if (url === '/api/branches') {
        return jsonResponse(200, {
          success: true,
          data: { branches: [{ _id: 'branch-1', name: 'Centro' }] },
        });
      }
      if (url === '/api/users' && init?.method === 'POST') {
        return jsonResponse(409, {
          success: false,
          error: 'A user with this email already exists',
          code: 'DUPLICATE_EMAIL',
          details: [{ field: 'email', message: 'A user with this email already exists' }],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt('/users/new');

    await user.type(screen.getByLabelText(/^nombre/i), 'Dup User');
    await user.type(screen.getByLabelText(/^email/i), 'dup@x.com');
    await user.type(screen.getByLabelText(/^contraseña/i), 'supersecret1');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'supersecret1');
    await user.click(screen.getByRole('button', { name: /crear usuario/i }));

    expect(await screen.findByText(/ya existe un usuario con este email/i)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith('/users');
  });

  it('blocks submission when passwords do not match', async () => {
    seedAdminSession();
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/me') {
        return jsonResponse(200, {
          success: true,
          data: { user: adminUser, business: { _id: 'biz-1', name: 'Biz', slug: 'biz' } },
        });
      }
      if (url === '/api/branches') {
        return jsonResponse(200, { success: true, data: { branches: [] } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt('/users/new');

    await user.type(screen.getByLabelText(/^nombre/i), 'A');
    await user.type(screen.getByLabelText(/^email/i), 'a@x.com');
    await user.type(screen.getByLabelText(/^contraseña/i), 'supersecret1');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'differentpass');
    await user.click(screen.getByRole('button', { name: /crear usuario/i }));

    expect(screen.getByText(/las contraseñas no coinciden/i)).toBeInTheDocument();
    const usersPost = fetchMock.mock.calls.find(
      ([input, init]) =>
        (typeof input === 'string' ? input : (input as URL).toString()) === '/api/users' &&
        init?.method === 'POST',
    );
    expect(usersPost).toBeUndefined();
  });
});
