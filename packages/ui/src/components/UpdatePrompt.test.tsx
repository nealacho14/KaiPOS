import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdatePrompt } from './UpdatePrompt.js';

describe('UpdatePrompt', () => {
  it('stays hidden until a new worker is waiting', () => {
    render(<UpdatePrompt open={false} onUpdate={() => {}} onDismiss={() => {}} />);

    expect(screen.queryByTestId('pwa-update-prompt')).not.toBeInTheDocument();
  });

  it('announces the new version when open', () => {
    render(<UpdatePrompt open onUpdate={() => {}} onDismiss={() => {}} />);

    expect(screen.getByText(/nueva versión disponible/i)).toBeInTheDocument();
  });

  it('applies the update on confirm', async () => {
    const onUpdate = vi.fn();
    render(<UpdatePrompt open onUpdate={onUpdate} onDismiss={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /actualizar/i }));

    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('dismisses without updating', async () => {
    const onUpdate = vi.fn();
    const onDismiss = vi.fn();
    render(<UpdatePrompt open onUpdate={onUpdate} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: /ahora no/i }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
