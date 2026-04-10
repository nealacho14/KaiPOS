# Plan: Esquema de Base de Datos Core

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd8152aa9ffa01180e80ad) |
| Spec          | `.specs/NT-33618b91_esquema-base-datos-core/spec.md`              |
| Branch        | `NT-33618b91/esquema-base-datos-core/feature`                     |
| Target        | `main`                                                            |

## Phase 1: Schema, Setup Script & Seed Data

### Tasks

- [x] **Evolve existing types** in `packages/shared/src/types/index.ts`:
  - Add `businessId: string` and `createdBy: string` to `Product`, `Order`, `User`
  - Add `branchId: string` to `Order`
  - Add `modifiers` array to `OrderItem` (references to applied modifiers with name/price)
  - Add `tableId?: string` to `Order`
  - Add `passwordHash: string` to `User`
  - Keep `_id` as `string` (not `ObjectId`) — consistent with current pattern
- [x] **Add new domain types** in `packages/shared/src/types/index.ts`:
  - `Business`: `_id`, `name`, `slug`, `address?`, `phone?`, `email?`, `isActive`, `createdAt`, `updatedAt`
  - `Branch`: `_id`, `businessId`, `name`, `address?`, `phone?`, `isActive`, `createdAt`, `updatedAt`, `createdBy`
  - `Category`: `_id`, `businessId`, `name`, `description?`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`, `createdBy`
  - `Modifier`: `_id`, `businessId`, `name`, `options` array (name + price), `isActive`, `createdAt`, `updatedAt`, `createdBy`
  - `Table`: `_id`, `branchId`, `number`, `capacity`, `status` (`available | occupied | reserved | out-of-service`), `createdAt`, `updatedAt`, `createdBy`
  - `Transaction`: `_id`, `businessId`, `orderId`, `amount`, `method` (reuse `PaymentMethod`), `status` (`pending | completed | failed | refunded`), `reference?`, `createdAt`, `updatedAt`, `createdBy`
  - Add `TableStatus` and `TransactionStatus` union types
- [x] **Update re-exports** in `packages/shared/src/index.ts` — add all new types to the `export type` block
- [x] **Add collection getters** in `apps/backend/src/db/collections.ts` — add typed getters for `businesses`, `branches`, `categories`, `modifiers`, `tables`, `transactions` (6 new, 3 existing)
- [x] **Create setup script** at `apps/backend/src/db/setup.ts`:
  - Use `getDb()` from `client.ts` to get the database
  - For each of the 9 collections:
    1. Create collection with `db.createCollection()` and JSON Schema `$jsonSchema` validator (use `validationAction: "error"`, `validationLevel: "moderate"` so existing docs aren't rejected on update)
    2. If collection already exists, update validator via `db.command({ collMod })` — makes the script idempotent
    3. Create compound indexes with `collection.createIndex()` (idempotent by default)
  - JSON Schema validators should enforce required fields and basic types (string, number, boolean, date, array) — not overly strict to avoid blocking future evolution
  - Indexes per spec: see Planned Collections table in spec.md
- [x] **Add seed data function** in the setup script:
  - 1 `Business` (restaurant theme)
  - 1 `Branch` for that business
  - 3 `User`s (one per role: admin, manager, cashier) linked to the business
  - 4-5 `Category`s (e.g., Appetizers, Main Course, Drinks, Desserts)
  - 8-10 `Product`s spread across categories with realistic names/prices
  - 2-3 `Modifier`s (e.g., Size, Extra Toppings)
  - 5-6 `Table`s for the branch
  - Skip seeding orders/transactions — these are transactional and better created through the app
  - Seed function should check if data already exists (by business slug) to be idempotent
- [x] **Add `db:setup` script** to `apps/backend/package.json`:
  - Command: `"db:setup": "DOTENV_CONFIG_PATH=../../.env tsx --require dotenv/config src/db/setup.ts"`
  - Follows the same env-loading pattern as the existing `dev` script
- [x] **Verify backwards compatibility** — existing imports of `Product`, `Order`, `User` from `@kaipos/shared` in `collections.ts`, `App.tsx` must continue to compile. New fields added to existing types should be required (they'll be populated by the setup script on new DBs; existing code paths that create documents will need updating in future tickets, which is out of scope here). Exception: fields that make sense as optional (like `tableId` on `Order`) should be optional.

### Verification

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm build` succeeds
- [ ] Manual verification: run `pnpm docker:up` then `pnpm --filter @kaipos/backend db:setup` against the local MongoDB and confirm all collections, indexes, and seed data are created. Run `db:setup` a second time to verify idempotency.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] Run `pnpm typecheck` across the monorepo — no type errors
- [ ] Run `pnpm lint` — no lint errors
- [ ] Run `pnpm build` — backend builds successfully (tsup bundles new types)
- [ ] Start local dev (`pnpm docker:up` + `pnpm dev`) — health endpoint still works
- [ ] Run `pnpm --filter @kaipos/backend db:setup` on a clean local MongoDB — all 9 collections created with validators and indexes
- [ ] Run `db:setup` again — idempotent, no errors, no duplicate seed data
- [ ] Inspect MongoDB collections via `mongosh` or Compass: confirm validators are attached, indexes exist, seed data is realistic
- [ ] Verify `collections.ts` exports all 9 typed collection getters
