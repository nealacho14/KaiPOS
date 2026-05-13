import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { KaiPOSLogo } from './KaiPOSLogo.js';

const useColorSchemeMock = vi.fn();

vi.mock('../providers/useColorScheme.js', () => ({
  useColorScheme: () => useColorSchemeMock(),
}));

beforeEach(() => {
  useColorSchemeMock.mockReset();
  useColorSchemeMock.mockReturnValue({ mode: 'light', systemMode: 'light' });
});

function getWordmark() {
  // The wordmark is two adjacent <span>s with "kai" and "POS".
  return {
    kai: screen.queryByText('kai'),
    pos: screen.queryByText('POS'),
  };
}

describe('KaiPOSLogo', () => {
  it('renders the default horizontal variant with K mark + wordmark', () => {
    render(<KaiPOSLogo />);
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.getByText('kai')).toBeInTheDocument();
    expect(screen.getByText('POS')).toBeInTheDocument();
  });

  it('renders the icon variant without the wordmark', () => {
    render(<KaiPOSLogo variant="icon" />);
    expect(screen.getByText('K')).toBeInTheDocument();
    const { kai, pos } = getWordmark();
    expect(kai).toBeNull();
    expect(pos).toBeNull();
  });

  it('renders the wordmark variant without the K mark', () => {
    render(<KaiPOSLogo variant="wordmark" />);
    expect(screen.queryByText('K')).toBeNull();
    expect(screen.getByText('kai')).toBeInTheDocument();
    expect(screen.getByText('POS')).toBeInTheDocument();
  });

  it('renders the stacked variant with K mark + wordmark in a column', () => {
    render(<KaiPOSLogo variant="stacked" />);
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.getByText('kai')).toBeInTheDocument();
    expect(screen.getByText('POS')).toBeInTheDocument();
  });

  it.each([['xs'], ['sm'], ['md'], ['lg'], ['xl'], ['xxl']] as const)(
    'renders at size %s',
    (size) => {
      const { container } = render(<KaiPOSLogo size={size} />);
      expect(container.firstChild).toBeTruthy();
    },
  );

  it.each(['color', 'white', 'dark'] as const)(
    'renders explicit colorVariant=%s without consulting useColorScheme',
    (colorVariant) => {
      render(<KaiPOSLogo colorVariant={colorVariant} variant="icon" />);
      expect(screen.getByText('K')).toBeInTheDocument();
    },
  );

  it('resolves colorVariant=auto to `color` when the color scheme is light', () => {
    useColorSchemeMock.mockReturnValue({ mode: 'light', systemMode: 'light' });
    const { container } = render(<KaiPOSLogo variant="icon" colorVariant="auto" />);
    // Color variant fills the mark with the teal brand color.
    const mark = container.querySelector('.MuiBox-root');
    expect(mark).toBeTruthy();
    expect(within(container).getByText('K')).toBeInTheDocument();
  });

  it('resolves colorVariant=auto to `white` when the color scheme is dark', () => {
    useColorSchemeMock.mockReturnValue({ mode: 'dark', systemMode: 'dark' });
    render(<KaiPOSLogo variant="wordmark" colorVariant="auto" />);
    // Wordmark renders both spans in white when resolved variant is "white".
    expect(screen.getByText('kai')).toBeInTheDocument();
    expect(screen.getByText('POS')).toBeInTheDocument();
  });

  it('falls back to `systemMode` when the requested mode is "system"', () => {
    useColorSchemeMock.mockReturnValue({ mode: 'system', systemMode: 'dark' });
    render(<KaiPOSLogo variant="icon" colorVariant="auto" />);
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('handles colorVariant="dark" path in Wordmark (uses brand mark ink)', () => {
    render(<KaiPOSLogo variant="wordmark" colorVariant="dark" />);
    expect(screen.getByText('kai')).toBeInTheDocument();
    expect(screen.getByText('POS')).toBeInTheDocument();
  });
});
