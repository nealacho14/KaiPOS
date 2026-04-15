import type { MiddlewareHandler } from 'hono';
import type { ZodType } from 'zod';
import { ValidationError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validate(schemas: ValidationSchemas): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (schemas.body) {
      const body = await c.req.json();
      const result = schemas.body.safeParse(body);
      if (!result.success) {
        throw new ValidationError(result.error.issues);
      }
    }

    if (schemas.params) {
      const params = c.req.param();
      const result = schemas.params.safeParse(params);
      if (!result.success) {
        throw new ValidationError(result.error.issues);
      }
    }

    if (schemas.query) {
      const query = c.req.query();
      const result = schemas.query.safeParse(query);
      if (!result.success) {
        throw new ValidationError(result.error.issues);
      }
    }

    await next();
  };
}
