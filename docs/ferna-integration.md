# Ferna ↔ KaiPOS: read contract

Ferna (repo `AI-First`, the Mura virtual barista) reads the Mura menu **directly from the KaiPOS
MongoDB** (Atlas, database `kaipos`). It never writes. This file is the contract: collections, filters,
document shapes, ids and pricing rules Ferna can rely on. KaiPOS will not rename anything listed here
without updating this file first and notifying the Ferna side.

## Connection

- Cluster: the prod Atlas cluster behind `kaipos/prod/mongo-uri`. Ferna uses its **own read-only DB
  user** (`ferna-reader`, role `read` on `kaipos`), created by hand in the Atlas UI. The KaiPOS secret
  is never shared.
- Ferna env: `MONGODB_URI` (the `mongodb+srv://ferna-reader:…/kaipos` URI), `KAIPOS_BUSINESS_ID`,
  `KAIPOS_BRANCH_ID` (values below). Atlas Network Access must allow Ferna's egress (Vercel + local).
- Every `_id` in KaiPOS is a **string UUID v4**, never an `ObjectId`. Do not cast.
- Cache the catalog on Ferna's side (≥ 60 s). Do not query per chat turn.

## Fixed identifiers

| Entity                            | Value                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Business "Mura" (`slug: mura`)    | `00000000-0000-4000-8000-000000001000`                                                                                                                                                     |
| Branch "Alianza Colombo-Francesa" | `00000000-0000-4000-8000-000000001100`                                                                                                                                                     |
| Categories                        | `00000000-0000-4000-8000-0000000020NN` (NN = 01 Filtrados, 02 Café, 03 Ice, 04 Cold Brew, 05 Frappé, 06 Tés, 07 Jugos, 08 Fizz, 09 Otros, 10 Cervezas, 11 Desayunos, 12 Bowls, 13 All Day) |
| Products                          | `00000000-0000-4000-8000-0000000030NN` (seeded ones; products created later from the admin get random UUIDs)                                                                               |

The same database also holds Cypress fixture businesses. **Every query must filter by
`businessId` and `branchId`**; never by name.

## Queries (Node driver)

```ts
const db = client.db('kaipos');
const businessId = process.env.KAIPOS_BUSINESS_ID;
const branchId = process.env.KAIPOS_BRANCH_ID;

// Categories (business-scoped, ordered)
const categories = await db
  .collection('categories')
  .find({ businessId, isActive: true })
  .sort({ sortOrder: 1, name: 1 })
  .toArray();

// Products Ferna may show/recommend
const products = await db
  .collection('products')
  .find({ businessId, branchId, isActive: true, 'availability.online': true })
  .toArray();

// Featured ("Destacados")
const featuredIds = (
  await db
    .collection('productPreferences')
    .find({ businessId, branchId, featured: true }, { projection: { productId: 1 } })
    .toArray()
).map((p) => p.productId);
```

Ordering rule (mirror of `listProducts` in `apps/backend/src/services/products.ts`): sort in memory by
`category.sortOrder` (join `product.category` = `category.name` within the same `businessId`), then
`product.sortOrder`, then `name.localeCompare(other, "es")`.

Semantics:

- `isActive: false` is a soft delete. Never show those.
- `availability.online: false` means "not offered through Ferna" (today: beers and wine). They stay
  visible in the POS but must not reach the chatbot, the menu page or the valid-slug list.
- A `productPreferences` row with `featured: false` (or no row) means **not** featured. Un-featuring
  does not delete the row, so always filter `featured: true`.
- `availabilityWindow` (`{ daysOfWeek: number[], from: "HH:mm", to: "HH:mm" }`) and
  `modifierGroups[].options[].available` are optional time windows evaluated in the branch timezone
  (`branches.timezone`, `America/Bogota`). The Mura seed sets none; treat "absent" as "always".

## Document shapes

Source of truth: `packages/shared/src/types/index.ts` and the validators in
`apps/backend/src/db/setup.ts`. Tolerate extra fields and missing optional ones.

`products`

| Field                    | Type                                                                                        | Notes                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `_id`                    | string (UUID)                                                                               |                                                             |
| `businessId`, `branchId` | string                                                                                      | filter keys                                                 |
| `name`                   | string                                                                                      | display name                                                |
| `description`            | string                                                                                      | never empty for Mura products                               |
| `price`                  | number                                                                                      | **COP pesos, integer** (`12000` = $12.000). Not cents.      |
| `category`               | string                                                                                      | the category **name**, join key to `categories.name`        |
| `sku`                    | string                                                                                      | **Ferna's slug.** Kebab-case, unique per branch (see below) |
| `imageUrl`               | string?                                                                                     | absolute `https://` URL served by CloudFront                |
| `allergens`              | `('gluten'\|'dairy'\|'egg'\|'peanut'\|'tree-nut'\|'soy'\|'fish'\|'shellfish'\|'sesame')[]`  |                                                             |
| `dietaryTags`            | `('vegetarian'\|'vegan'\|'gluten-free'\|'keto'\|'halal'\|'kosher')[]`                       |                                                             |
| `variants`               | `{ id, name, sku, priceDelta, imageUrl? }[]`?                                               | size/flavor; `priceDelta` relative to `price`               |
| `modifierGroups`         | `{ id, name, required, maxSelectable, options: { id, label, priceDelta, available? }[] }[]` | add-ons                                                     |
| `availability`           | `{ pos, online, kiosk }` booleans                                                           | use `online`                                                |
| `availabilityWindow`     | `{ daysOfWeek, from, to }`?                                                                 | see above                                                   |
| `sortOrder`              | number                                                                                      | within category                                             |
| `isActive`               | boolean                                                                                     |                                                             |

Ignore: `stock`, `trackStock`, `stockUnit`, `lowStockThreshold`, `cost`, `taxRate`,
`kitchenStationIds`, `barcode`, `serviceSchedules`, `createdBy`, `createdAt`, `updatedAt`.

`categories`: `{ _id, businessId, name, description?, sortOrder, isActive }`. Key on `_id` (stable
across renames; a rename cascades the new name into `products.category`), use `name` for display.

`productPreferences`: `{ _id, businessId, branchId, productId, featured, updatedAt, updatedBy }`.

`businesses`: `{ _id, name, slug, currency? }` (`currency` absent ⇒ `COP`). `branches`:
`{ _id, businessId, name, timezone }`.

## SKU = slug

Ferna keys products by a lowercase kebab slug (`[a-z0-9-]+`). KaiPOS has no `slug` field; the
product `sku` plays that role. The Mura seed uses kebab SKUs (`espresso`, `ice-latte`,
`filtrado-lavado`, `bowl-pulled-pork`) and variant SKUs derived from them (`filtrado-lavado-2-tazas`,
`cordial-costa-dorada`). Ferna normalises defensively:

```ts
const slug = sku
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
```

Renaming a SKU in the admin changes Ferna's slug for that product (cards, boosts, few-shot examples).
Keep SKUs kebab-case and stable; treat a SKU change as a breaking change for Ferna.

## Money and effective price

Prices are plain numbers in **COP**, no cents, 2-decimal doubles in Mongo. Display with
`Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })`.

Effective unit price (mirror of `computeEffectivePrice` in `packages/shared/src/utils/pricing.ts`):

```
base  = price + (selectedVariant?.priceDelta ?? 0)
total = round2(base + Σ selectedOption.priceDelta)      // unknown ids are ignored
```

Examples: Filtrado Honey · 2 tazas · Chemex = 15000 + 11000 + 0 = **26000**. Latte · leche de avena ·
vainilla = 12000 + 5000 + 6000 = **23000**. When any variant has `priceDelta > 0` show
`desde $<price>`.

## Modifier groups and variants (Mura seed)

Group and option ids are stable and part of this contract:

| Group id           | Name      | `required` / `maxSelectable` | Options (id → delta)                                                                                                          | Attached to               |
| ------------------ | --------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `metodo`           | Método    | true / 1                     | `v60`, `chemex`, `prensa-francesa` → 0                                                                                        | Filtrados                 |
| `leche`            | Leche     | true / 1                     | `leche-deslactosada` 0 (default), `leche-almendra` 5000, `leche-avena` 5000                                                   | milk-based drinks         |
| `extras`           | Extras    | false / 3                    | `vainilla`, `caramelo`, `amaretto`, `avellana` 6000; `leche-condensada`, `syrup-corozo`, `syrup-tamarindo`, `syrup-lulo` 4000 | drinks                    |
| `michelada`        | Adiciones | false / 1                    | `michelada` 3000                                                                                                              | beers (online: false)     |
| `adiciones-comida` | Adiciones | false / 6                    | `huevos`, `queso`, `tocineta` 6000; `pulled-pork`, `pollo-apanado` 9000; `carne-angus` 12000                                  | Desayunos, Bowls, All Day |

`required: true` + `maxSelectable: 1` ⇒ exactly one option; `required: false` ⇒ zero to
`maxSelectable`. Variants: Filtrados sizes `1-taza` (+0), `2-tazas`, `3-tazas`; Cordial flavors
`costa-dorada`, `valle-de-las-rosas`, `japon-tropical`, `mexico-ardiente`, `vinas-de-francia` (+0).

## Images

`imageUrl` is always an absolute `https://` URL on `d6tpeu874uebt.cloudfront.net` (the assets CDN).
Today every Mura product points at the shared placeholder
`https://d6tpeu874uebt.cloudfront.net/products/00000000-0000-4000-8000-000000001100/placeholder.webp`;
real photos uploaded from the admin replace it per product. Render whatever URL is present; do not
derive filenames.

## Fixture for Ferna tests

`pnpm --filter @kaipos/backend menu:export` prints the seeded Mura catalog (`business`, `branch`,
`categories`, `products`, `productPreferences`) as deterministic JSON without touching any database.
Ferna vendors that output as its mock-repository fixture and never edits it by hand.

## Change policy

- Validators in `apps/backend/src/db/setup.ts` are the schema source of truth.
- Additive changes (new optional fields) need no coordination.
- Renaming or removing any field/collection above, changing the SKU convention, or changing the fixed
  ids requires updating this document and notifying the Ferna side before deploying.
