import pino from 'pino';
import type { LoggerOptions, TransportSingleOptions } from 'pino';
import { isProduction } from './env.js';

// Pino redact paths. fast-redact (the engine pino uses) supports `*` only as a
// single-segment wildcard, so we enumerate top-level + one-level-deep variants
// for the fields we actually log. Cookies and Authorization headers are also
// covered under typical request shapes (`headers.x`, `req.headers.x`).
const REDACT_PATHS = [
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'accessToken',
  'jwtSecret',
  'authorization',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.jwtSecret',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.headers.authorization',
  '*.headers.cookie',
];

export function buildLoggerOptions(): LoggerOptions {
  return {
    level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'kaipos-api' },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
}

const transport: TransportSingleOptions | undefined = isProduction
  ? undefined
  : { target: 'pino-pretty', options: { colorize: true } };

export const logger = pino({ ...buildLoggerOptions(), transport });

export function createLogger(context?: Record<string, unknown>): pino.Logger {
  return context ? logger.child(context) : logger;
}
