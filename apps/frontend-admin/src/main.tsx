import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import { KaiPOSThemeProvider } from '@kaipos/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KaiPOSThemeProvider>
      <App />
    </KaiPOSThemeProvider>
  </StrictMode>,
);
