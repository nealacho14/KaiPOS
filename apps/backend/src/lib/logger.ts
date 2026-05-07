import pino from 'pino';
import type { TransportSingleOptions } from 'pino';
import { isProduction } from './env.js';

const transport: TransportSingleOptions | undefined = isProduction
  ? undefined
  : { target: 'pino-pretty', options: { colorize: true } };

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'kaipos-api' },
  transport,
});

export function createLogger(context?: Record<string, unknown>): pino.Logger {
  return context ? logger.child(context) : logger;
}
