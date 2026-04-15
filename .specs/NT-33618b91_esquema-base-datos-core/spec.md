# Spec: Esquema de Base de Datos Core

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd8152aa9ffa01180e80ad) |
| Status        | To-do                                                             |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/esquema-base-datos-core/feature`                     |
| Created       | 2026-04-10                                                        |

## Context

KaiPOS needs to evolve from its current basic schema (3 collections: `products`, `orders`, `users` with simple types) into a full multi-tenant POS data model. The system uses MongoDB with the native driver (no Mongoose), row-level tenant isolation via a `businessId` field on every document, and typed collection access through `apps/backend/src/db/collections.ts`.

Currently the types in `@kaipos/shared/types` are minimal — no multi-tenancy fields, no audit trail (`createdBy`), and no support for business entities like branches, categories, modifiers, tables, or transactions. The database has no JSON Schema validators or compound indexes.

This work is the foundation for all subsequent POS features (ordering, payments, table management) and must be in place before those can proceed.

## Requirements

- Evolve existing types (`Product`, `Order`, `User`) to include `businessId` and audit fields (`createdAt`, `updatedAt`, `createdBy`)
- Add new types: `Business`, `Branch`, `Category`, `Modifier`, `Table`, `Transaction`
- All document types must include `businessId` for row-level multi-tenant isolation (except `Business` itself)
- Keep existing `UserRole` as-is: `admin | cashier | manager`
- Multi-tenancy enforcement is at the caller level (types + indexes only, no automatic query wrapper)
- Add `OrderItem` support for modifiers (modifier references on line items)
- Define JSON Schema validators at the collection level for all 9 collections
- Create compound indexes optimized for multi-tenant queries (always include `businessId` as prefix where applicable)
- Create a setup script (`apps/backend/src/db/setup.ts`) that creates collections with validators, indexes, and seed data
- Add a `pnpm db:setup` command to the backend package
- Seed data must be realistic: at least 1 business, 1 branch, users of each role, sample products, categories, and tables

## Acceptance Criteria

- [ ] The setup script creates all 9 collections with JSON Schema validators
- [ ] Compound indexes are defined (at least `businessId` + frequent query fields per collection)
- [ ] Seed data creates realistic data: 1+ business, 1+ branch, users per role, products, categories, tables
- [ ] Types in `@kaipos/shared` reflect the complete schema with multi-tenancy and audit fields
- [ ] Collection getters in `collections.ts` expose all 9 collections with correct typing
- [ ] Existing code that imports `Product`, `Order`, `User` from `@kaipos/shared` continues to compile (backwards-compatible type evolution)
- [ ] The `pnpm db:setup` command runs successfully on a clean database
- [ ] The `pnpm db:setup` command is idempotent (safe to re-run)

## Planned Collections

| Collection     | Status | Key Indexes                                                     |
| -------------- | ------ | --------------------------------------------------------------- |
| `businesses`   | New    | `slug` (unique)                                                 |
| `branches`     | New    | `businessId`, `businessId + name`                               |
| `users`        | Evolve | `email` (unique), `businessId + role`                           |
| `categories`   | New    | `businessId + name`, `businessId + isActive`                    |
| `products`     | Evolve | `businessId + sku` (unique), `businessId + category + isActive` |
| `modifiers`    | New    | `businessId`, `businessId + isActive`                           |
| `tables`       | New    | `branchId + number` (unique), `branchId + status`               |
| `orders`       | Evolve | `businessId + branchId + createdAt`, `businessId + orderNumber` |
| `transactions` | New    | `businessId + orderId`, `businessId + createdAt`                |

## Out of Scope

- Automatic multi-tenant query enforcement (wrapper/middleware) — callers filter by `businessId` manually
- Order processing logic or payment flow — only the data structures
- Authentication/authorization middleware
- API routes for CRUD operations on new collections
- Migration of existing data (this targets fresh/dev databases)

## Open Questions

- None at this time — the Notion ticket is comprehensive and user decisions have been captured above.
