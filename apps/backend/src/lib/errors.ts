import type { ApiErrorDetail, ApiErrorResponse } from '@kaipos/shared/types';
import type { ZodIssue } from 'zod';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(issues: ZodIssue[]) {
    const details: ApiErrorDetail[] = issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      received: 'received' in issue ? issue.received : undefined,
    }));

    super('Validation failed', 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class InternalError extends AppError {
  constructor() {
    super('Internal server error', 500, 'INTERNAL_ERROR');
    this.name = 'InternalError';
  }
}

export function formatErrorResponse(error: AppError): ApiErrorResponse {
  return {
    success: false,
    error: error.message,
    code: error.code,
    ...(error.details && { details: error.details }),
  };
}
