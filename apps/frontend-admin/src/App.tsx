import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './components/guards/index.js';
import { AppLayout } from './layouts/AppLayout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { CategoriesListPage } from './pages/CategoriesListPage.js';
import { DebugWebSocket } from './pages/DebugWebSocket.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ProductFormPage } from './pages/ProductFormPage.js';
import { ProductsListPage } from './pages/ProductsListPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
import { UserFormPage } from './pages/UserFormPage.js';
import { UsersListPage } from './pages/UsersListPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route element={<RequirePermission permission="products:read" />}>
            <Route path="/products" element={<ProductsListPage />} />
            <Route element={<RequirePermission permission="products:write" />}>
              <Route path="/products/new" element={<ProductFormPage />} />
              <Route path="/products/:id/edit" element={<ProductFormPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission permission="categories:read" />}>
            <Route path="/categories" element={<CategoriesListPage />} />
          </Route>
          <Route element={<RequirePermission permission="users:read" />}>
            <Route path="/users" element={<UsersListPage />} />
            <Route element={<RequirePermission permission="users:write" />}>
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
