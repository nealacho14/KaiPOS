import { RequireAuth, RequirePermission } from '@kaipos/app-runtime';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from '@kaipos/auth-pages';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { CategoriesListPage } from './pages/CategoriesListPage.js';
import { DebugWebSocket } from './pages/DebugWebSocket.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ProductFormPage } from './pages/ProductFormPage.js';
import { ProductsListPage } from './pages/ProductsListPage.js';
import { UserFormPage } from './pages/UserFormPage.js';
import { UsersListPage } from './pages/UsersListPage.js';

const ADMIN_FALLBACK = '/dashboard';
const APP_VERSION = import.meta.env.VITE_APP_VERSION;

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage defaultRedirectPath={ADMIN_FALLBACK} appVersion={APP_VERSION} />}
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to={ADMIN_FALLBACK} replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            element={<RequirePermission permission="products:read" fallbackPath={ADMIN_FALLBACK} />}
          >
            <Route path="/products" element={<ProductsListPage />} />
            <Route
              element={
                <RequirePermission permission="products:write" fallbackPath={ADMIN_FALLBACK} />
              }
            >
              <Route path="/products/new" element={<ProductFormPage />} />
              <Route path="/products/:id/edit" element={<ProductFormPage />} />
            </Route>
          </Route>
          <Route
            element={
              <RequirePermission permission="categories:read" fallbackPath={ADMIN_FALLBACK} />
            }
          >
            <Route path="/categories" element={<CategoriesListPage />} />
          </Route>
          <Route
            element={<RequirePermission permission="users:read" fallbackPath={ADMIN_FALLBACK} />}
          >
            <Route path="/users" element={<UsersListPage />} />
            <Route
              element={<RequirePermission permission="users:write" fallbackPath={ADMIN_FALLBACK} />}
            >
              <Route path="/users/new" element={<UserFormPage />} />
              <Route path="/users/:id/edit" element={<UserFormPage />} />
            </Route>
          </Route>
          <Route path="/debug/ws" element={<DebugWebSocket />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
