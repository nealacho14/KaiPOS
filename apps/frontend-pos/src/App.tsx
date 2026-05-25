import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './components/guards/index.js';
import { PosLayout } from './layouts/PosLayout.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NoBranchPage } from './pages/NoBranchPage.js';
import { PosHomePage } from './pages/PosHomePage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
import { SelectBusinessPage } from './pages/SelectBusinessPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<PosLayout />}>
          <Route element={<RequirePermission permission="products:read" />}>
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
