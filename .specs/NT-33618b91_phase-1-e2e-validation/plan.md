# Plan: Paso 12 — Tests End-to-End y Validación de la Fase 1

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Notion Ticket  | [NT-33618b91](https://notion.so/33618b913fdd81dcbfb6f67fe32c942d)  |
| Spec           | `.specs/NT-33618b91_phase-1-e2e-validation/spec.md`                |
| Feature Branch | `NT-33618b91/phase-1-e2e-validation/feature`                       |
| Target         | `main`                                                             |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 branch targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Decisions resolved during planning

These supersede the Open Questions in the spec:

- **E2E framework**: **Cypress** ejecutado contra el **frontend admin desplegado en staging**. La URL viene de la variable `CYPRESS_BASE_URL` configurada en GitHub Actions (Variables, no Secrets — no es sensible). Default local apunta a `http://localhost:3000` para correr contra `pnpm dev`.
- **OpenAPI form**: archivo `apps/backend/openapi.json` versionado en repo + endpoint `/api/docs` servido por el backend solo en `NODE_ENV !== 'production'`. CI verifica que el JSON está en sync con los schemas Zod (regenerar y comparar).
- **Fixtures / aislamiento**: negocios y usuarios de test pre-seeded en staging (`cypress-biz-a`, `cypress-biz-b` con un usuario por rol). Idempotente. Cypress nunca crea ni borra cuentas — sólo lee credenciales desde env y muta datos transitorios (productos creados se borran al final de cada test).
- **WebSocket**: cubierto por **Cypress smoke** (login en SPA → confirmar `WebSocket: Activo` en el chip del header). Permisos de canales y handlers quedan cubiertos por los unit tests existentes (`ws-connect.test.ts`, `ws-default.test.ts`, `ws-disconnect.test.ts`, `ws-auth.test.ts`).
- **CI placement**: **job nuevo `e2e` en paralelo** al `quality` actual. Ambos requeridos para merge vía branch protection. Esto preserva el tiempo del job `quality` (Cypress contra staging es más lento por naturaleza).
- **Setup script**: `scripts/setup.sh` (bash) invocado por `pnpm setup`. Hace pre-checks (Node 20, Docker activo), copia `.env.example` si falta, levanta `docker:up -d`, espera health de Mongo, corre `db:setup` y `db:seed`. Bash en lugar de pnpm-only porque necesita health-check loop sobre `docker compose ps`.
- **Workspace para Cypress**: nueva workspace `apps/e2e/` (ya cubierta por `apps/*` en `pnpm-workspace.yaml`). Mantiene Cypress fuera del bundle del frontend admin y le da scripts propios (`pnpm --filter @kaipos/e2e cy:open`, `cy:run`).

## Phase 1: Cypress foundation + auth E2E suite

**Branch**: `NT-33618b91/phase-1-e2e-validation/e2e-foundation`
**Targets**: `NT-33618b91/phase-1-e2e-validation/feature`

### Tasks

- [x] Crear workspace `apps/e2e/` con `package.json` (`@kaipos/e2e`, `private`, `type: "module"`), `tsconfig.json` extendiendo `@kaipos/tsconfig/node.json`, y dependencias: `cypress` (devDep), `@kaipos/shared` (workspace).
- [x] `apps/e2e/cypress.config.ts` con `baseUrl` desde `CYPRESS_BASE_URL` (default `http://localhost:3000`), `e2e.specPattern: 'src/**/*.cy.ts'`, `viewportWidth/Height` razonables, `video: false`, `retries: { runMode: 2, openMode: 0 }`.
- [x] `apps/e2e/src/support/commands.ts` con custom commands tipados:
  - `cy.apiLogin(email, password)` → POST `/api/auth/login` directo (rápido, sin pasar por el form), guarda tokens en `localStorage` siguiendo la convención del SPA.
  - `cy.loginAs(role)` → wrapper que mapea `'admin' | 'manager' | 'cashier' | ...` a credenciales pre-seeded leídas desde Cypress env (`Cypress.env('USER_ADMIN_EMAIL')` etc.).
  - `cy.logout()` → llama el endpoint y limpia storage.
- [x] `apps/e2e/src/support/e2e.ts` que importa commands; tipos en `apps/e2e/cypress.d.ts` para que TypeScript reconozca los custom commands.
- [x] Suite `apps/e2e/src/auth.cy.ts`: login válido (admin) llega a dashboard; login inválido muestra error y permanece en `/login`; sesión persiste tras refresh del browser; logout limpia tokens y redirige a `/login`; intentar acceder a ruta protegida sin token redirige a login.
- [x] `apps/e2e/.env.example` documentando todas las variables que la suite consume (`CYPRESS_BASE_URL`, `CYPRESS_USER_ADMIN_EMAIL`, etc.).
- [x] Scripts en `apps/e2e/package.json`: `cy:open`, `cy:run`, `lint`, `typecheck`. (Decisión: `test` se omite a propósito para que el `pnpm test` repo-wide del pre-commit/CI no invoque Cypress; el job `e2e` de la Fase 4 llama `cy:run` directamente.)
- [x] README a nivel `apps/e2e/README.md`: cómo correr local (`pnpm --filter @kaipos/e2e cy:open`), variables requeridas, dónde viven las credenciales.
- [x] Wire `pnpm e2e` en `package.json` raíz como `pnpm --filter @kaipos/e2e cy:run` (cómodo desde la raíz).
- [x] Documentar en `apps/e2e/README.md` el contrato de seed de staging: qué cuentas y negocios deben existir (`cypress-biz-a`, `cypress-biz-b`, usuarios por rol). El script de seed real se entrega en P2.

### Verification

- [x] `pnpm typecheck` passes (incluye nueva workspace `@kaipos/e2e`).
- [x] `pnpm lint` passes.
- [x] `pnpm format:check` passes.
- [x] `pnpm build` succeeds.
- [ ] Manual: contra `pnpm dev` local con seed default, `pnpm --filter @kaipos/e2e cy:open` arranca Cypress y la suite `auth.cy.ts` corre verde de extremo a extremo.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: RBAC + Products CRUD + multi-tenant E2E

**Branch**: `NT-33618b91/phase-1-e2e-validation/e2e-rbac-products-tenancy`
**Targets**: `NT-33618b91/phase-1-e2e-validation/e2e-foundation`

### Tasks

- [x] **Seed de staging**: `apps/backend/src/db/seed-cypress.ts` que crea (idempotente) los dos negocios de test (`cypress-biz-a`, `cypress-biz-b`), un branch por negocio, y un usuario por rol en cada uno (`admin`, `manager`, `supervisor`, `cashier`, `waiter`, `kitchen`). Reutiliza `hashPassword` y los mismos patrones de UUID estables del seed existente. Mismas guardas anti-Atlas que `seed.ts` salvo `MONGO_SECRET_ARN` — para staging se usa el `db:seed-cypress` invocado manualmente o por workflow una sola vez tras provisión.
- [x] Script `pnpm --filter @kaipos/backend db:seed-cypress` con `DOTENV_CONFIG_PATH=../../.env tsx --require dotenv/config src/db/seed-cypress.ts`. El staging deploy lo corre una vez post-deploy o el operador lo invoca contra la URL de Mongo de staging desde su máquina con creds adecuadas.
- [x] Suite `apps/e2e/src/rbac.cy.ts`: para cada rol (admin, manager, supervisor, cashier, waiter, kitchen):
  - Login con la cuenta correspondiente.
  - Verificar visibilidad del sidebar: items presentes/ausentes según `hasPermission(role, permission)` (gating real ya implementado en `apps/frontend-admin/src/components/Sidebar`).
  - Acceso directo por URL a una ruta no permitida (e.g. `/users` para `cashier`) muestra "no autorizado" o redirige.
  - Logout entre roles.
  - Casos super_admin con `businessId === '*'`: el header business-picker permite seleccionar negocio y la SPA actúa scoped.
- [x] Suite `apps/e2e/src/products.cy.ts`: como admin de `cypress-biz-a`:
  - Crear producto via UI (form en `/products/new`), confirmar aparece en la lista.
  - Editar el mismo producto (cambiar precio), confirmar el cambio se persiste tras refresh.
  - Eliminar el producto, confirmar desaparece de la lista.
  - Limpieza: si la suite falla a mitad, `afterEach` borra cualquier producto cuyo SKU coincida con el patrón `CYP-...` vía API (no via UI) para no dejar basura.
- [x] Suite `apps/e2e/src/multi-tenant.cy.ts`: como admin de `cypress-biz-a`, intentar acceder por URL directa a un producto cuyo `_id` pertenece a `cypress-biz-b` → la SPA debe mostrar 404 / "no encontrado" (porque la API retorna 404 por scoping de business). Mismo ejercicio para una categoría y una branch del negocio B. Para obtener IDs del biz-b, login transitorio con admin de biz-b al inicio de la suite y guardarlos en una variable de Cypress. _(Implementación: usamos los IDs deterministas del seed-cypress en lugar de un login transitorio — más rápido y sin riesgo de race entre suites paralelas. Categoría/branch verificadas vía API por ausencia de rutas UI por-id.)_
- [x] Custom command `cy.apiCreateProduct(payload)` y `cy.apiDeleteProduct(id)` para fixtures rápidas sin pasar por la UI.
- [x] Documentar en `apps/e2e/README.md` el catálogo completo de cuentas de test, sus credenciales (referenciadas como env vars), y qué SKU prefix se reserva para productos creados por Cypress (`CYP-`).
- [x] Actualizar `apps/e2e/.env.example` con los nuevos roles añadidos.

### Verification

- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` passes.
- [x] `pnpm format:check` passes.
- [x] `pnpm build` succeeds.
- [ ] Manual: contra `pnpm dev` local + `db:seed-cypress` aplicado, las 4 suites (auth, rbac, products, multi-tenant) corren verdes y los productos creados durante la suite quedan limpios al final.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 3: WebSocket smoke + OpenAPI generation

**Branch**: `NT-33618b91/phase-1-e2e-validation/ws-smoke-and-openapi`
**Targets**: `NT-33618b91/phase-1-e2e-validation/e2e-rbac-products-tenancy`

### Tasks

- [ ] Suite `apps/e2e/src/websocket-smoke.cy.ts`: login como admin, esperar a que el chip de WS en el `Header` muestre "Activo" (selector basado en `data-testid` o texto). Verifica el wiring extremo a extremo del `WebSocketProvider` sin entrar en lógica de canales/permisos (eso está cubierto por unit tests).
- [ ] Si el SPA no expone un `data-testid` estable para el chip de WS, añadirlo como cambio mínimo (`apps/frontend-admin/src/layouts/Header.tsx` o equivalente). Usar `data-testid="ws-status"` con value `"active" | "inactive"`.
- [ ] **OpenAPI generation** con `@asteasolutions/zod-to-openapi`:
  - Añadir devDep en `apps/backend/package.json`.
  - `apps/backend/src/openapi/registry.ts` que registra cada ruta + esquema Zod (auth, users, branches, businesses, categories, kitchen-stations, orders, products) usando los schemas que ya existen en `apps/backend/src/schemas/`.
  - `apps/backend/src/openapi/generate.ts` (script) que escribe `apps/backend/openapi.json`. Invocable como `pnpm --filter @kaipos/backend openapi:generate`.
  - Versionar el archivo `openapi.json` resultante.
- [ ] **`/api/docs` route** en `apps/backend/src/app.ts`: registrar **solo si `process.env.NODE_ENV !== 'production'`**. Servir Swagger UI vía CDN (script + link tags) leyendo de `/api/openapi.json`. Crear ruta `/api/openapi.json` que devuelve el JSON desde el filesystem (read-once, cache en módulo).
- [ ] **CI check**: paso adicional en el job `quality` (`Verify OpenAPI in sync`) que corre `pnpm --filter @kaipos/backend openapi:generate` y `git diff --exit-code apps/backend/openapi.json`. Si difiere, falla el build con mensaje "Run openapi:generate and commit the result".
- [ ] Documentar en `docs/architecture.md` (sección Backend) la nueva ruta `/api/docs` y el comando `openapi:generate`.

### Verification

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm format:check` passes.
- [ ] `pnpm build` succeeds.
- [ ] Manual: corriendo `pnpm dev`, `http://localhost:4000/api/docs` carga Swagger UI con todas las rutas y esquemas. La suite `websocket-smoke.cy.ts` corre verde. `pnpm --filter @kaipos/backend openapi:generate` no produce diff cuando los schemas no han cambiado.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 4: One-command setup + CI integration

**Branch**: `NT-33618b91/phase-1-e2e-validation/setup-script-and-ci`
**Targets**: `NT-33618b91/phase-1-e2e-validation/ws-smoke-and-openapi`

### Tasks

- [ ] **`scripts/setup.sh`** (bash, ejecutable): pre-checks (`node --version` >= 20, `docker info` responde), copia `.env.example` → `.env` si no existe (con warning para que el usuario rellene `JWT_SECRET`), `docker compose up -d --wait` para health check del backend/mongo, espera adicional con `pnpm --filter @kaipos/backend db:setup`, luego `db:seed`, e imprime instrucciones finales (URL, credenciales del admin seed). Idempotente: si ya está todo arriba, no rompe.
- [ ] **`pnpm setup`** en `package.json` raíz → `bash scripts/setup.sh`.
- [ ] **README**: nueva sección "Quick Start" en lo más alto que diga `git clone && pnpm setup && pnpm dev`, con tabla de prerrequisitos. Mover detalle anterior a "Manual setup" más abajo.
- [ ] **CI workflow** (`.github/workflows/ci.yml`):
  - Nuevo job `e2e` que corre en paralelo al `quality`:
    - Setup pnpm + Node 20.
    - `pnpm install --frozen-lockfile`.
    - `pnpm --filter @kaipos/e2e cy:run` con `CYPRESS_BASE_URL: ${{ vars.CYPRESS_BASE_URL }}` y las credenciales `CYPRESS_USER_*` desde **GitHub Actions Variables** (no Secrets — son cuentas de staging documentadas).
    - Subir `cypress/screenshots` y `cypress/videos` como artifacts si falla.
  - Job `deploy` ahora `needs: [quality, e2e, changes]` para que un fallo de E2E bloquee deploy a prod.
  - Configurar las variables en el repo: `CYPRESS_BASE_URL`, `CYPRESS_USER_ADMIN_EMAIL`, `CYPRESS_USER_ADMIN_PASSWORD`, `CYPRESS_USER_MANAGER_EMAIL`, `CYPRESS_USER_MANAGER_PASSWORD`, ... un par por rol y un par por business cruzado para multi-tenant. Documentar en `apps/e2e/README.md`.
- [ ] **Concurrencia / aislamiento entre PRs**: como múltiples PRs pueden correr el job `e2e` contra la misma staging simultáneamente, los SKUs de productos creados se prefijean con `CYP-${process.env.GITHUB_RUN_ID || 'local'}-...` para no chocar entre runs paralelos. La limpieza por `afterEach` sigue cazando solo los del run actual.
- [ ] **Budget < 3 min**: medir tiempo total del job `e2e` en al menos 3 corridas; si excede, paralelizar specs con `--parallel` (Cypress Cloud) está fuera de scope; en su lugar dividir suites y usar matrix de GH Actions (matriz por archivo de spec). Documentar la métrica final en el PR del último phase.
- [ ] Actualizar `CLAUDE.md` (si entra en el budget de 80 líneas) o `docs/local-dev.md` con la mención de `pnpm setup` y `pnpm e2e`.

### Verification

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm format:check` passes.
- [ ] `pnpm build` succeeds.
- [ ] Manual end-to-end: en una máquina sin clones previos, `git clone <repo> && cd KaiPOS && pnpm setup && pnpm dev` deja servicios arriba con seed listo para login (`admin@lacocinadekai.com` / `admin123`). Tiempo total del job `e2e` en GH Actions, sobre staging, queda **< 3 min**.

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] Las 4 suites Cypress (`auth`, `rbac`, `products`, `multi-tenant`, `websocket-smoke`) corren verdes en CI sobre el último phase, contra staging.
- [ ] Tiempo total del job `e2e` en CI < 3 minutos (medido en 3+ corridas).
- [ ] `pnpm test` (unit) sigue verde — no se rompió cobertura existente.
- [ ] `/api/docs` accesible en `pnpm dev` local; muestra todas las rutas con sus esquemas.
- [ ] `apps/backend/openapi.json` está commiteado y CI bloquea cualquier divergencia entre el archivo y los schemas Zod.
- [ ] Clone limpio + `pnpm setup` + `pnpm dev` deja un dev nuevo en estado funcional sin pasos manuales adicionales.
- [ ] El job `e2e` está marcado como required en branch protection sobre `main` (manual: pedirle al owner del repo que active el check).
- [ ] Probar el caso de fallo: introducir un PR que rompe RBAC adrede → el job `e2e` falla y bloquea el merge.
- [ ] Revisar que ningún workflow de CI necesita secrets adicionales no documentados (todo lo de Cypress vive en Variables, no Secrets).
- [ ] Documentación: `apps/e2e/README.md`, `docs/architecture.md` (`/api/docs`), README raíz (`Quick Start`), `docs/local-dev.md` actualizadas y consistentes.
- [ ] Verificar que la suite es ejecutable también localmente apuntando a `pnpm dev` (no solo staging) sobreescribiendo `CYPRESS_BASE_URL=http://localhost:3000`.
