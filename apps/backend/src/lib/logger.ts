import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'kaipos-api' },
});

export function createLogger(context?: Record<string, unknown>): pino.Logger {
  return context ? logger.child(context) : logger;
}
