import pino from 'pino';

export function createLogger(context?: Record<string, unknown>): pino.Logger {
  const base = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'kaipos-api' },
  });

  return context ? base.child(context) : base;
}

export const logger = createLogger();
