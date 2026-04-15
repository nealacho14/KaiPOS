import type { ErrorHandler } from 'hono';
import type { AppEnv } from '../types.js';
import { AppError, formatErrorResponse, InternalError } from '../lib/errors.js';
import { logger as rootLogger } from '../lib/logger.js';

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const log = c.get('logger') ?? rootLogger;

  if (err instanceof AppError) {
    log.error({ err, statusCode: err.statusCode, code: err.code }, err.message);
    return c.json(formatErrorResponse(err), err.statusCode as never);
  }

  log.error({ err }, 'Unhandled error');
  const internal = new InternalError();
  return c.json(formatErrorResponse(internal), 500);
};
