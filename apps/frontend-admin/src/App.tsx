import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './components/guards/index.js';
import { AppLayout } from './layouts/AppLayout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { DebugWebSocket } from './pages/DebugWebSocket.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { ProductsListPage } from './pages/ProductsListPage.js';
import { UsersListPage } from './pages/UsersListPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route element={<RequirePermission permission="products:read" />}>
            <Route path="/products" element={<ProductsListPage />} />
          </Route>
          <Route element={<RequirePermission permission="users:read" />}>
            <Route path="/users" element={<UsersListPage />} />
          </Route>
          <Route path="/debug/ws" element={<DebugWebSocket />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
