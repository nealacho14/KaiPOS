import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColorSchemeToggle } from './ColorSchemeToggle.js';

const setMode = vi.fn();
const useColorSchemeMock = vi.fn();

vi.mock('../providers/useColorScheme.js', () => ({
  useColorScheme: () => useColorSchemeMock(),
}));

beforeEach(() => {
  setMode.mockReset();
  useColorSchemeMock.mockReset();
});

describe('ColorSchemeToggle', () => {
  it('renders a disabled button while the color scheme is still resolving', () => {
    useColorSchemeMock.mockReturnValue({ mode: undefined, systemMode: undefined, setMode });
    render(<ColorSchemeToggle />);
    const button = screen.getByRole('button', { name: 'Toggle color scheme' });
    expect(button).toBeDisabled();
  });

  it('renders the dark-mode icon and an "Switch to dark mode" label in light mode', async () => {
    useColorSchemeMock.mockReturnValue({ mode: 'light', systemMode: 'light', setMode });
    const user = userEvent.setup();
    render(<ColorSchemeToggle />);
    const button = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(setMode).toHaveBeenCalledWith('dark');
  });

  it('renders the light-mode icon and switches back to light from dark mode', async () => {
    useColorSchemeMock.mockReturnValue({ mode: 'dark', systemMode: 'dark', setMode });
    const user = userEvent.setup();
    render(<ColorSchemeToggle />);
    const button = screen.getByRole('button', { name: 'Switch to light mode' });
    await user.click(button);
    expect(setMode).toHaveBeenCalledWith('light');
  });

  it('uses systemMode when mode is "system"', async () => {
    useColorSchemeMock.mockReturnValue({ mode: 'system', systemMode: 'dark', setMode });
    const user = userEvent.setup();
    render(<ColorSchemeToggle />);
    const button = screen.getByRole('button', { name: 'Switch to light mode' });
    await user.click(button);
    expect(setMode).toHaveBeenCalledWith('light');
  });

  it('forwards IconButton props to the underlying button', () => {
    useColorSchemeMock.mockReturnValue({ mode: 'light', systemMode: 'light', setMode });
    render(<ColorSchemeToggle size="small" data-testid="toggle" />);
    expect(screen.getByTestId('toggle')).toBeInTheDocument();
  });
});
