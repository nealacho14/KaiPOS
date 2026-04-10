import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders health data on successful fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            service: 'kaipos-api',
            version: '1.0.2',
            database: 'connected',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        }),
    } as Response);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('API Status: kaipos-api')).toBeInTheDocument();
    });
    expect(screen.getByText('Database: connected')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Could not connect to API')).toBeInTheDocument();
    });
  });

  it('renders the title and version', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('KaiPOS Admin')).toBeInTheDocument();
    expect(screen.getByText(/Version:/)).toBeInTheDocument();
  });
});
