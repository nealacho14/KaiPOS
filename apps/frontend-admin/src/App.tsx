import { RequireAuth, RequirePermission, resolveHomePath, useAuth } from '@kaipos/app-runtime';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from '@kaipos/auth-pages';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { CategoriesListPage } from './pages/CategoriesListPage.js';
import { DebugWebSocket } from './pages/DebugWebSocket.js';
import { NoAccessPage } from './pages/NoAccessPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ProductFormPage } from './pages/ProductFormPage.js';
import { ProductsListPage } from './pages/ProductsListPage.js';
import { UserFormPage } from './pages/UserFormPage.js';
import { UsersListPage } from './pages/UsersListPage.js';

// Post-login target. `/dashboard` is admin-only, but a non-admin landing here
// is immediately re-routed to their own home by the guard below, so this stays
// a plain constant instead of leaking role logic into @kaipos/auth-pages.
const LOGIN_REDIRECT = '/dashboard';
const APP_VERSION = import.meta.env.VITE_APP_VERSION;

// The authenticated tree is its own component so it can read `useAuth()` — it
// renders inside <RequireAuth>, where a user is guaranteed. Every guard falls
// back to the *role's* home rather than a fixed path: `/dashboard` requires
// `business:manage`, so a shared `/dashboard` fallback would bounce non-admins
// in a loop.
function AuthenticatedRoutes() {
  const { user } = useAuth();
  const home = user ? resolveHomePath(user.role) : LOGIN_REDIRECT;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route element={<RequirePermission permission="business:manage" fallbackPath={home} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
        <Route path="/no-access" element={<NoAccessPage />} />
        <Route element={<RequirePermission permission="products:read" fallbackPath={home} />}>
          <Route path="/products" element={<ProductsListPage />} />
          <Route element={<RequirePermission permission="products:write" fallbackPath={home} />}>
            <Route path="/products/new" element={<ProductFormPage />} />
            <Route path="/products/:id/edit" element={<ProductFormPage />} />
          </Route>
        </Route>
        <Route element={<RequirePermission permission="categories:read" fallbackPath={home} />}>
          <Route path="/categories" element={<CategoriesListPage />} />
        </Route>
        <Route element={<RequirePermission permission="users:read" fallbackPath={home} />}>
          <Route path="/users" element={<UsersListPage />} />
          <Route element={<RequirePermission permission="users:write" fallbackPath={home} />}>
            <Route path="/users/new" element={<UserFormPage />} />
            <Route path="/users/:id/edit" element={<UserFormPage />} />
          </Route>
        </Route>
        {/* Manual WS console against the prod endpoint (connect/subscribe/ping,
            order fan-out demo). Admin-scoped: in the wrong hands it is a free
            traffic generator against the WS Lambdas. */}
        <Route element={<RequirePermission permission="business:manage" fallbackPath={home} />}>
          <Route path="/debug/ws" element={<DebugWebSocket />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage defaultRedirectPath={LOGIN_REDIRECT} appVersion={APP_VERSION} />}
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route path="*" element={<AuthenticatedRoutes />} />
      </Route>
    </Routes>
  );
}
