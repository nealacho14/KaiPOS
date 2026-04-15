import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createLogger } from './logger.js';

const log = createLogger({ module: 'ses' });

const SES_REGION = process.env.SES_REGION || 'us-east-1';
const SES_SENDER_EMAIL = process.env.SES_SENDER_EMAIL;

let sesClient: SESClient | null = null;

function getClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({ region: SES_REGION });
  }
  return sesClient;
}

export async function sendPasswordResetEmail(
  recipientEmail: string,
  resetToken: string,
): Promise<void> {
  const baseUrl = process.env.PASSWORD_RESET_BASE_URL || 'http://localhost:3000';
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

  if (!SES_SENDER_EMAIL) {
    log.info(
      { email: recipientEmail, resetToken, resetLink },
      'SES not configured (no SES_SENDER_EMAIL). Password reset token logged for dev.',
    );
    return;
  }

  const client = getClient();

  await client.send(
    new SendEmailCommand({
      Source: SES_SENDER_EMAIL,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: 'KaiPOS - Restablecer contrasena' },
        Body: {
          Text: {
            Data: [
              'Hola,',
              '',
              'Recibimos una solicitud para restablecer tu contrasena en KaiPOS.',
              '',
              `Haz clic en el siguiente enlace para crear una nueva contrasena:`,
              resetLink,
              '',
              'Este enlace expira en 1 hora.',
              '',
              'Si no solicitaste este cambio, puedes ignorar este correo.',
              '',
              '— KaiPOS',
            ].join('\n'),
          },
        },
      },
    }),
  );

  log.info({ email: recipientEmail }, 'Password reset email sent via SES');
}
