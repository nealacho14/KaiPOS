import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted() runs before vi.mock() factories and before imports are resolved.
// This lets us share stable mock references across vi.mock() calls and tests.
const { mockSend, mockLog } = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { mockSend, mockLog };
});

// SESClient is used as `new SESClient(...)`, so the factory must expose a constructor.
// Using a plain function (not an arrow function) satisfies the `new` requirement.
vi.mock('@aws-sdk/client-ses', () => {
  function SESClient(_opts: unknown) {
    return { send: mockSend };
  }
  function SendEmailCommand(input: unknown) {
    return { input };
  }
  return { SESClient, SendEmailCommand };
});

vi.mock('./logger.js', () => ({
  createLogger: () => mockLog,
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module registry so each test re-evaluates ses.ts with the current env vars.
  // SES_SENDER_EMAIL and PASSWORD_RESET_BASE_URL are read at module evaluation time.
  vi.resetModules();
  delete process.env.SES_SENDER_EMAIL;
  delete process.env.PASSWORD_RESET_BASE_URL;
});

afterEach(() => {
  delete process.env.SES_SENDER_EMAIL;
  delete process.env.PASSWORD_RESET_BASE_URL;
});

describe('sendPasswordResetEmail', () => {
  describe('dev fallback (no SES_SENDER_EMAIL)', () => {
    it('returns without calling SES when SES_SENDER_EMAIL is not set', async () => {
      const { sendPasswordResetEmail } = await import('./ses.js');

      await sendPasswordResetEmail('user@example.com', 'token-abc');

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('logs the reset token and link via Pino in dev mode', async () => {
      const { sendPasswordResetEmail } = await import('./ses.js');

      await sendPasswordResetEmail('dev@example.com', 'dev-token-xyz');

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'dev@example.com',
          resetToken: 'dev-token-xyz',
        }),
        expect.stringContaining('SES not configured'),
      );
    });
  });

  describe('SES send path (SES_SENDER_EMAIL is set)', () => {
    it('calls SESClient.send with correct Source and recipient', async () => {
      process.env.SES_SENDER_EMAIL = 'noreply@kaipos.com';
      mockSend.mockResolvedValue({});

      const { sendPasswordResetEmail } = await import('./ses.js');
      await sendPasswordResetEmail('customer@example.com', 'reset-token-999');

      expect(mockSend).toHaveBeenCalledOnce();
      const [command] = mockSend.mock.calls[0];
      expect(command.input.Source).toBe('noreply@kaipos.com');
      expect(command.input.Destination.ToAddresses).toContain('customer@example.com');
    });

    it('includes the reset link in the email body', async () => {
      process.env.SES_SENDER_EMAIL = 'noreply@kaipos.com';
      process.env.PASSWORD_RESET_BASE_URL = 'https://app.kaipos.com';
      mockSend.mockResolvedValue({});

      const { sendPasswordResetEmail } = await import('./ses.js');
      await sendPasswordResetEmail('user@example.com', 'my-token');

      const [command] = mockSend.mock.calls[0];
      const body: string = command.input.Message.Body.Text.Data;
      expect(body).toContain('https://app.kaipos.com/reset-password?token=my-token');
    });

    it('uses http://localhost:3000 as default base URL when PASSWORD_RESET_BASE_URL is not set', async () => {
      process.env.SES_SENDER_EMAIL = 'noreply@kaipos.com';
      // PASSWORD_RESET_BASE_URL intentionally not set
      mockSend.mockResolvedValue({});

      const { sendPasswordResetEmail } = await import('./ses.js');
      await sendPasswordResetEmail('user@example.com', 'tok');

      const [command] = mockSend.mock.calls[0];
      const body: string = command.input.Message.Body.Text.Data;
      expect(body).toContain('http://localhost:3000/reset-password?token=tok');
    });

    it('propagates errors thrown by SESClient.send', async () => {
      process.env.SES_SENDER_EMAIL = 'noreply@kaipos.com';
      const sesError = new Error('SES throttled');
      mockSend.mockRejectedValue(sesError);

      const { sendPasswordResetEmail } = await import('./ses.js');

      await expect(sendPasswordResetEmail('fail@example.com', 'tok')).rejects.toThrow(
        'SES throttled',
      );
    });
  });
});
