// OpenAPI registry for the KaiPOS backend. Each route is registered with the
// existing Zod schemas from `apps/backend/src/schemas/` (re-exported from
// `@kaipos/shared/schemas` where applicable) so the generated `openapi.json`
// stays in sync with runtime validation. Drift is caught in CI by
// `pnpm --filter @kaipos/backend openapi:generate` followed by `git diff`.
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  resetPasswordSchema,
} from '../schemas/auth.js';
import {
  categoryIdParamSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '../schemas/categories.js';
import {
  createKitchenStationSchema,
  listKitchenStationsQuerySchema,
} from '../schemas/kitchen-stations.js';
import {
  createOrderSchema,
  orderParamsSchema,
  updateOrderStatusSchema,
} from '../schemas/orders.js';
import {
  createProductSchema,
  featureProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  reorderProductsSchema,
  updateProductSchema,
  uploadUrlSchema,
} from '../schemas/products.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from '../schemas/users.js';

extendZodWithOpenApi(z);

const successEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ success: z.literal(true), data });

const successOnly = z.object({ success: z.literal(true) });

const paginatedEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(item),
    pagination: z.object({
      page: z.number().int().min(1),
      limit: z.number().int().min(1),
      total: z.number().int().min(0),
      totalPages: z.number().int().min(0),
    }),
  });

const errorEnvelope = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

const branchListItem = z.object({ _id: z.string(), name: z.string() });

const idObject = z.object({ _id: z.string() }).passthrough();

const messageObject = z.object({ message: z.string() });

const tokensResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({}).passthrough(),
});

const bearerScheme = 'bearerAuth';

export function buildRegistry(): OpenAPIRegistry {
  const r = new OpenAPIRegistry();

  r.registerComponent('securitySchemes', bearerScheme, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  // --- Health -------------------------------------------------------------
  r.registerPath({
    method: 'get',
    path: '/api/health',
    tags: ['health'],
    summary: 'Liveness + dependency health check',
    responses: {
      200: {
        description: 'Health snapshot (mongo, optional websocket, etc.)',
        content: {
          'application/json': { schema: successEnvelope(z.object({}).passthrough()) },
        },
      },
    },
  });

  // --- Auth ---------------------------------------------------------------
  r.registerPath({
    method: 'post',
    path: '/api/auth/login',
    tags: ['auth'],
    summary: 'Exchange email + password for access + refresh tokens',
    request: { body: { content: { 'application/json': { schema: loginSchema } } } },
    responses: {
      200: {
        description: 'Tokens + user profile',
        content: { 'application/json': { schema: successEnvelope(tokensResponse) } },
      },
      401: {
        description: 'Invalid credentials',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/api/auth/me',
    tags: ['auth'],
    summary: 'Resolve the current session user',
    security: [{ [bearerScheme]: [] }],
    responses: {
      200: {
        description: 'Authenticated user',
        content: { 'application/json': { schema: successEnvelope(z.object({}).passthrough()) } },
      },
      401: {
        description: 'Missing or invalid token',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/auth/refresh',
    tags: ['auth'],
    summary: 'Issue new tokens from a valid refresh token',
    request: { body: { content: { 'application/json': { schema: refreshSchema } } } },
    responses: {
      200: {
        description: 'New token pair',
        content: { 'application/json': { schema: successEnvelope(tokensResponse) } },
      },
      401: {
        description: 'Refresh token rejected',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/auth/logout',
    tags: ['auth'],
    summary: 'Revoke a refresh token',
    request: { body: { content: { 'application/json': { schema: logoutSchema } } } },
    responses: {
      200: {
        description: 'Token revoked',
        content: { 'application/json': { schema: successOnly } },
      },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/auth/forgot-password',
    tags: ['auth'],
    summary: 'Send a reset link if the email is registered',
    request: { body: { content: { 'application/json': { schema: forgotPasswordSchema } } } },
    responses: {
      200: {
        description: 'Acknowledged (response is intentionally generic to avoid user enumeration)',
        content: { 'application/json': { schema: successEnvelope(messageObject) } },
      },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/auth/reset-password',
    tags: ['auth'],
    summary: 'Complete a password reset with a token from the reset email',
    request: { body: { content: { 'application/json': { schema: resetPasswordSchema } } } },
    responses: {
      200: {
        description: 'Password updated',
        content: { 'application/json': { schema: successEnvelope(messageObject) } },
      },
      400: {
        description: 'Token expired/invalid',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  // --- Users --------------------------------------------------------------
  r.registerPath({
    method: 'get',
    path: '/api/users',
    tags: ['users'],
    summary: "List users in the caller's business",
    security: [{ [bearerScheme]: [] }],
    request: { query: listUsersQuerySchema },
    responses: {
      200: {
        description: 'Paginated user list',
        content: { 'application/json': { schema: paginatedEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/api/users/{id}',
    tags: ['users'],
    summary: 'Fetch a user by id',
    security: [{ [bearerScheme]: [] }],
    request: { params: userIdParamSchema },
    responses: {
      200: {
        description: 'User record',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
      404: { description: 'Not found', content: { 'application/json': { schema: errorEnvelope } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/users',
    tags: ['users'],
    summary: 'Create a user',
    security: [{ [bearerScheme]: [] }],
    request: { body: { content: { 'application/json': { schema: createUserSchema } } } },
    responses: {
      201: {
        description: 'Created user',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
      403: {
        description: 'Forbidden (insufficient permission)',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  r.registerPath({
    method: 'patch',
    path: '/api/users/{id}',
    tags: ['users'],
    summary: 'Update a user',
    security: [{ [bearerScheme]: [] }],
    request: {
      params: userIdParamSchema,
      body: { content: { 'application/json': { schema: updateUserSchema } } },
    },
    responses: {
      200: {
        description: 'Updated user',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'delete',
    path: '/api/users/{id}',
    tags: ['users'],
    summary: 'Soft-delete (deactivate) a user',
    security: [{ [bearerScheme]: [] }],
    request: { params: userIdParamSchema },
    responses: {
      200: {
        description: 'Deactivated user',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  // --- Branches -----------------------------------------------------------
  r.registerPath({
    method: 'get',
    path: '/api/branches',
    tags: ['branches'],
    summary: 'List branches accessible to the caller',
    security: [{ [bearerScheme]: [] }],
    request: {
      query: z.object({ businessId: z.string().min(1).optional() }),
    },
    responses: {
      200: {
        description: 'Branch list (id + name only)',
        content: {
          'application/json': {
            schema: successEnvelope(z.object({ branches: z.array(branchListItem) })),
          },
        },
      },
    },
  });

  // --- Businesses ---------------------------------------------------------
  r.registerPath({
    method: 'get',
    path: '/api/businesses',
    tags: ['businesses'],
    summary: 'List all businesses (super_admin only)',
    security: [{ [bearerScheme]: [] }],
    responses: {
      200: {
        description: 'Business list',
        content: { 'application/json': { schema: successEnvelope(z.array(idObject)) } },
      },
      403: {
        description: 'Forbidden (only super_admin)',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  // --- Categories ---------------------------------------------------------
  r.registerPath({
    method: 'get',
    path: '/api/categories',
    tags: ['categories'],
    summary: 'List product categories',
    security: [{ [bearerScheme]: [] }],
    request: { query: listCategoriesQuerySchema },
    responses: {
      200: {
        description: 'Paginated categories',
        content: { 'application/json': { schema: paginatedEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/categories',
    tags: ['categories'],
    summary: 'Create a category',
    security: [{ [bearerScheme]: [] }],
    request: { body: { content: { 'application/json': { schema: createCategorySchema } } } },
    responses: {
      201: {
        description: 'Created category',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'patch',
    path: '/api/categories/{id}',
    tags: ['categories'],
    summary: 'Update a category',
    security: [{ [bearerScheme]: [] }],
    request: {
      params: categoryIdParamSchema,
      body: { content: { 'application/json': { schema: updateCategorySchema } } },
    },
    responses: {
      200: {
        description: 'Updated category',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'delete',
    path: '/api/categories/{id}',
    tags: ['categories'],
    summary: 'Soft-delete a category',
    security: [{ [bearerScheme]: [] }],
    request: { params: categoryIdParamSchema },
    responses: {
      200: {
        description: 'Deactivated category',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  // --- Kitchen stations ---------------------------------------------------
  r.registerPath({
    method: 'get',
    path: '/api/kitchen-stations',
    tags: ['kitchen-stations'],
    summary: 'List kitchen stations for a branch',
    security: [{ [bearerScheme]: [] }],
    request: { query: listKitchenStationsQuerySchema },
    responses: {
      200: {
        description: 'Paginated kitchen stations',
        content: { 'application/json': { schema: paginatedEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/kitchen-stations',
    tags: ['kitchen-stations'],
    summary: 'Create a kitchen station for a branch',
    security: [{ [bearerScheme]: [] }],
    request: { body: { content: { 'application/json': { schema: createKitchenStationSchema } } } },
    responses: {
      201: {
        description: 'Created kitchen station',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  // --- Orders -------------------------------------------------------------
  r.registerPath({
    method: 'post',
    path: '/api/orders',
    tags: ['orders'],
    summary: 'Create an order',
    security: [{ [bearerScheme]: [] }],
    request: { body: { content: { 'application/json': { schema: createOrderSchema } } } },
    responses: {
      201: {
        description: 'Created order',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'patch',
    path: '/api/orders/{id}/status',
    tags: ['orders'],
    summary: 'Update order status',
    security: [{ [bearerScheme]: [] }],
    request: {
      params: orderParamsSchema,
      body: { content: { 'application/json': { schema: updateOrderStatusSchema } } },
    },
    responses: {
      200: {
        description: 'Updated order',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  // --- Products -----------------------------------------------------------
  r.registerPath({
    method: 'get',
    path: '/api/products',
    tags: ['products'],
    summary: 'List products with optional search/filter',
    security: [{ [bearerScheme]: [] }],
    request: { query: listProductsQuerySchema },
    responses: {
      200: {
        description: 'Paginated products',
        content: { 'application/json': { schema: paginatedEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/api/products/{id}',
    tags: ['products'],
    summary: 'Fetch a product by id',
    security: [{ [bearerScheme]: [] }],
    request: { params: productIdParamSchema },
    responses: {
      200: {
        description: 'Product',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
      404: { description: 'Not found', content: { 'application/json': { schema: errorEnvelope } } },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/products',
    tags: ['products'],
    summary: 'Create a product',
    security: [{ [bearerScheme]: [] }],
    request: { body: { content: { 'application/json': { schema: createProductSchema } } } },
    responses: {
      201: {
        description: 'Created product',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'patch',
    path: '/api/products/{id}',
    tags: ['products'],
    summary: 'Update a product',
    security: [{ [bearerScheme]: [] }],
    request: {
      params: productIdParamSchema,
      body: { content: { 'application/json': { schema: updateProductSchema } } },
    },
    responses: {
      200: {
        description: 'Updated product',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
    },
  });

  r.registerPath({
    method: 'delete',
    path: '/api/products/{id}',
    tags: ['products'],
    summary: 'Soft-delete a product',
    security: [{ [bearerScheme]: [] }],
    request: { params: productIdParamSchema },
    responses: {
      204: { description: 'Deleted (no content)' },
    },
  });

  r.registerPath({
    method: 'patch',
    path: '/api/products/reorder',
    tags: ['products'],
    summary: 'Bulk-update sortOrder for products in a branch',
    security: [{ [bearerScheme]: [] }],
    request: { body: { content: { 'application/json': { schema: reorderProductsSchema } } } },
    responses: {
      200: {
        description: 'Reorder applied',
        content: {
          'application/json': {
            schema: successEnvelope(z.object({ matched: z.number().int().min(0) })),
          },
        },
      },
      400: {
        description: 'One or more product ids not found in this branch',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  r.registerPath({
    method: 'get',
    path: '/api/products/preferences',
    tags: ['products'],
    summary: 'Featured product ids for a branch',
    security: [{ [bearerScheme]: [] }],
    request: {
      query: z.object({ branchId: z.string().min(1) }),
    },
    responses: {
      200: {
        description: 'Ids of the products featured in this branch',
        content: {
          'application/json': {
            schema: successEnvelope(z.object({ featuredProductIds: z.array(z.string()) })),
          },
        },
      },
      403: {
        description: 'Access denied to this branch',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  r.registerPath({
    method: 'patch',
    path: '/api/products/{id}/feature',
    tags: ['products'],
    summary: 'Toggle a product as featured for a branch',
    security: [{ [bearerScheme]: [] }],
    request: {
      params: productIdParamSchema,
      body: { content: { 'application/json': { schema: featureProductSchema } } },
    },
    responses: {
      200: {
        description: 'Updated product preference',
        content: { 'application/json': { schema: successEnvelope(idObject) } },
      },
      404: {
        description: 'Product not found in this branch',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  r.registerPath({
    method: 'post',
    path: '/api/products/upload-url',
    tags: ['products'],
    summary: 'Pre-signed S3 URL for product image upload',
    security: [{ [bearerScheme]: [] }],
    request: { body: { content: { 'application/json': { schema: uploadUrlSchema } } } },
    responses: {
      201: {
        description: 'Pre-signed PUT URL + public URL',
        content: {
          'application/json': {
            schema: successEnvelope(
              z.object({ uploadUrl: z.string().url(), publicUrl: z.string().url() }),
            ),
          },
        },
      },
      503: {
        description: 'Asset bucket not configured for this environment',
        content: { 'application/json': { schema: errorEnvelope } },
      },
    },
  });

  return r;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  components?: Record<string, unknown>;
  paths: Record<string, unknown>;
  [key: string]: unknown;
}

export function generateOpenApiDocument(): OpenApiDocument {
  const generator = new OpenApiGeneratorV3(buildRegistry().definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'KaiPOS API',
      version: '1.0.0',
      description:
        'KaiPOS backend HTTP API. Generated from Zod schemas via `pnpm --filter @kaipos/backend openapi:generate`.',
    },
    servers: [
      { url: 'http://localhost:4000', description: 'pnpm dev (Docker Mongo)' },
      { url: 'http://localhost:4001', description: 'pnpm docker:up (Docker Mongo)' },
    ],
  }) as OpenApiDocument;
}
