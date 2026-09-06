# Spec: Menú de Mura en KaiPOS para Ferna

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Notion Ticket | NT-mura-menu (sin página Notion)         |
| Status        | In progress                              |
| Priority      | High                                     |
| Branch        | `NT-mura-menu/mura-menu-ferna/feature`   |
| Created       | 2026-09-06                               |

## Context

Ferna (repo `AI-First`) es el barista virtual de Mura y hoy trabaja con un menú hardcodeado. KaiPOS será
el POS de Mura, así que Ferna debe empezar a leer los productos que se crean en KaiPOS directamente desde
la misma base MongoDB Atlas (`kaipos`). Este spec cubre el lado KaiPOS: dejar la base con un único
negocio real (Mura) alimentado desde `mura_menu.docx`, abrir el límite de imágenes y publicar el contrato
de lectura que Ferna implementa en su repo.

Compatibilidad de schema acordada con la sesión Ferna (sin cambiar el modelo de KaiPOS):

- `product.sku` es el slug de Ferna (`[a-z0-9-]+`). El seed usa skus kebab-case únicos por sucursal.
- Las categorías se identifican por `_id` fijo; el orden es `categories.sortOrder`.
- Las "Adiciones" del menú son `modifierGroups` con ids estables, no una categoría.
- Alcohol se seedea con `availability.online: false`; Ferna solo lee `availability.online === true`.
- Destacados = `productPreferences.featured === true`.

## Requirements

- Seed de Mura como módulo de datos puro (`apps/backend/src/db/seed-data/mura-menu.ts`) con 13 categorías
  y 64 productos, precios y descripciones del docx, variantes (filtrados por tazas, sabores de Cordial) y
  grupos de modificadores (Método, Leche, Extras, Michelada, Adiciones de comida).
- Un solo negocio `mura` (COP) con una sucursal "Alianza Colombo-Francesa" (`America/Bogota`).
- Dos admins: `admin@mura.co` (password por `MURA_ADMIN_PASSWORD`) y `kelvin.hernandezc30@gmail.com`
  migrado conservando su `passwordHash`.
- Script `db:purge-business` (dry-run por defecto) para borrar todo lo de `la-cocina-de-kai` en Atlas sin
  tocar los fixtures Cypress ni el super_admin.
- Script `menu:export` que serializa el seed a JSON (fixture de Ferna) sin tocar la base.
- Límite de imagen 10 MB (shared + admin + tests + OpenAPI) con compresión en cliente
  (`browser-image-compression`) antes del presign.
- `docs/ferna-integration.md` con el contrato de lectura y runbook de cutover en `docs/database.md`.

## Acceptance Criteria

- [ ] `db:setup` + `db:seed` en Docker Mongo deja 13 categorías, 64 productos, 5 destacados y 2 admins; un
      segundo `db:seed` es no-op.
- [ ] `pnpm --filter @kaipos/backend menu:export` imprime JSON determinista con 64 productos.
- [ ] `db:purge-business -- --slug la-cocina-de-kai` sin `--yes` no borra nada y lista conteos; con
      `--yes` elimina solo ese negocio; rechaza slugs `cypress-*`.
- [ ] `POST /api/products/upload-url` acepta `fileSize` = 10 MB y rechaza 10 MB + 1; el admin comprime a
      WebP ≤ ~1 MB antes de subir, en imagen principal y de variante.
- [ ] `apps/backend/openapi.json` regenerado y en sync.
- [ ] Atlas queda con negocios `mura`, `cypress-biz-a`, `cypress-biz-b`; login en prod con ambos admins.
- [ ] `docs/ferna-integration.md` publicado con queries, shapes, fórmula de precio e IDs fijos.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` verdes; CI `quality` verde.

## Out of Scope

- Endpoints de Ferna, su estado cliente y su prompt (viven en el repo `AI-First`).
- Fotos reales de los productos (se usa un placeholder genérico en CloudFront).
- Un campo `slug` nuevo en el modelo de producto de KaiPOS.
- Creación del usuario Atlas read-only y de las variables de GitHub (acciones manuales del usuario,
  documentadas en el runbook).

## Open Questions

- Dirección, teléfono y email reales de Mura / Alianza Colombo-Francesa (placeholders `TODO(mura)` en el
  seed hasta que el usuario los confirme).
