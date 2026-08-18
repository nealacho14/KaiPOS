import { KaiPOSThemeProvider } from '@kaipos/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@kaipos/app-runtime';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KaiPOSThemeProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </KaiPOSThemeProvider>
  </StrictMode>,
);
