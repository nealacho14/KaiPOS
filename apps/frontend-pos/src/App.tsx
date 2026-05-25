import { RequireAuth, RequirePermission } from '@kaipos/app-runtime';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from '@kaipos/auth-pages';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PosLayout } from './layouts/PosLayout.js';
import { NoBranchPage } from './pages/NoBranchPage.js';
import { PosHomePage } from './pages/PosHomePage.js';
import { SelectBusinessPage } from './pages/SelectBusinessPage.js';

const POS_FALLBACK = '/';
const APP_VERSION = import.meta.env.VITE_APP_VERSION;

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage defaultRedirectPath={POS_FALLBACK} appVersion={APP_VERSION} />}
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<PosLayout />}>
          <Route
            element={<RequirePermission permission="products:read" fallbackPath={POS_FALLBACK} />}
          >
            <Route path="/" element={<PosHomePage />} />
          </Route>
          <Route path="/no-branch" element={<NoBranchPage />} />
          <Route path="/select-business" element={<SelectBusinessPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
