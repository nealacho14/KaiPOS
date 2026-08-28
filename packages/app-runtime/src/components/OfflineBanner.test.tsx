import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner.js';

function renderBanner(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  render(
    <KaiPOSThemeProvider>
      <OfflineBanner />
    </KaiPOSThemeProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    renderBanner(true);

    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });

  it('warns that the catalog is readable but nothing can be charged', () => {
    renderBanner(false);

    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();
    // The "no cobrar" half is the load-bearing part: offline is read-only and
    // orders are not queued, so the copy must not imply otherwise.
    expect(screen.getByText(/no cobrar/i)).toBeInTheDocument();
  });
});
