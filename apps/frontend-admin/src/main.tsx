import '@kaipos/ui/fonts';
import { KaiPOSThemeProvider } from '@kaipos/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@kaipos/app-runtime';
import { App } from './App.js';
import { PwaUpdater } from './pwa/PwaUpdater.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KaiPOSThemeProvider>
      {/* Outside the router and the auth guards on purpose: mounted inside a
          layout it would only register for signed-in users, so a first visit
          never installed the worker and the app was not installable. */}
      <PwaUpdater />
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </KaiPOSThemeProvider>
  </StrictMode>,
);
