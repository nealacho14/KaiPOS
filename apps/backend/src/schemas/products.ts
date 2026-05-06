// The authoritative schema lives in `@kaipos/shared/schemas/products` so the
// frontend can use the same Zod schema for client-side validation. This file
// is kept as a thin re-export to avoid a workspace-wide import rewrite.
export * from '@kaipos/shared/schemas/products';
