import { Box } from '@kaipos/ui';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/guards/index.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Box sx={{ p: 4 }}>POS shell coming in phase 2</Box>} />
      </Route>
    </Routes>
  );
}
