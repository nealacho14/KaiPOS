# Spec: Paso 10 — CRUD de Productos (Primer Feature E2E)

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Notion Ticket | [NT-33618b91](https://notion.so/33618b913fdd81ec8013f6156d9b275f) |
| Status        | In Progress                                                       |
| Priority      | Alta                                                              |
| Branch        | `NT-33618b91/crud-productos/feature`                              |
| Created       | 2026-04-23                                                        |

## Context

Paso 10 es el primer feature end-to-end de la plataforma: gestión de productos. Valida que la fundación (Hono + Zod + Mongo + RBAC + shell admin + WebSocket) funciona end-to-end sobre un caso real.

Cambio clave de modelo (2026-04-23): los productos dejan de estar asociados sólo al negocio y pasan a estar **scoped por sucursal** (`branchId`). Cada branch maneja su propio catálogo; se conserva `businessId` en el documento para tenant-isolation + auditoría, siguiendo el patrón de `orders` y `kitchenStations`.

Adicionalmente, durante el intake se decidió **expandir el modelo de datos más allá del redactado original del ticket** para que coincida con el mockup de referencia en `kaiPos (2)/kaiPOS - Crear producto.html` (ver sección "Modelo de datos extendido"). El mockup es la fuente visual; los componentes se construyen con `@kaipos/ui`, no con CSS inline ni con imports directos de `@mui/material`/`lucide-react`.

La UI de administración vive en `apps/frontend-admin` (React 19 + React Router v7) y reutiliza el patrón de `UsersListPage.tsx` para el listado. El formulario de creación/edición se construye como páginas dedicadas (`/products/new` y `/products/:id/edit`) para acomodar el layout de dos columnas (form + sidebar pegajoso) del mockup.

## Requirements

### Backend — API

- Endpoints bajo `/api/products` implementados con Hono + Zod + middleware `requireAuth` + `requirePermission` + `validate`, siguiendo el patrón de `routes/users.ts` / `routes/orders.ts` / `routes/kitchen-stations.ts`:
  - `GET /api/products?branchId=<id>` — listar. `branchId` **requerido**. Soporta `q` (búsqueda case-insensitive sobre `name` y `sku`), `category` (filtro), `includeInactive=true` (por defecto excluye `isActive: false`). Gateado por `requireBranchAccess('branchId')` (lee del query string).
  - `GET /api/products/:id` — leer un producto. Cross-branch y cross-tenant devuelven **404**.
  - `POST /api/products` — crear. `branchId` en el body; el servicio valida `assertBranchAccess(user, body.branchId)` inline.
  - `PATCH /api/products/:id` — editar (no `PUT`, alineado con `PATCH /api/users/:id`). Carga el doc, valida branch + tenant, luego muta. `branchId` **no editable** (mover un producto entre branches queda fuera del alcance).
  - `DELETE /api/products/:id` — soft delete (setea `isActive: false`). Misma validación de branch/tenant.
  - `POST /api/products/upload-url` — devuelve una URL pre-firmada S3 PUT (scope: `s3://kaipos-assets-prod/products/<branchId>/<uuid>.<ext>`). Body: `{ branchId, contentType, fileSize }`. Valida `assertBranchAccess` y `requirePermission('products:write')`. Limita `contentType ∈ {image/jpeg, image/png, image/webp}` y `fileSize ≤ 2 MB`. Devuelve `{ uploadUrl, publicUrl, expiresIn }` (pre-signed expira a los 60s).
- Logs estructurados con Pino (`createLogger({ module: 'products-service' })`). Sin `console.log`.
- Cross-branch y cross-tenant reads devuelven **404** (no 403) para no filtrar existencia, consistente con `services/users.ts` y `services/orders.ts`.
- Cross-branch y cross-tenant mutaciones devuelven **403 + audit log** `authorization_failed` con `metadata: { branchId, route, method }`.

### Backend — Datos y esquema (`packages/shared` + `apps/backend/src/db`)

- **Extender el tipo `Product`** en `packages/shared/src/types/index.ts` y el validador `$jsonSchema` de la colección `products` en `apps/backend/src/db/setup.ts` con los siguientes campos. Tipos `Allergen`, `DietaryTag`, `StockUnit`, `ServiceSchedule`, `ModifierGroup`, `ModifierOption`, `ProductAvailability` se exportan desde `@kaipos/shared/types` para reuso en backend y frontend:
  - `branchId: string` (**requerido**).
  - `imageUrl?: string` (opcional).
  - `cost?: number` (opcional, ≥ 0). Margen es derivado — **no se persiste**.
  - `taxRate?: number` (opcional, 0–100, percentage).
  - `trackStock: boolean` (requerido, default `true` en Zod create schema).
  - `lowStockThreshold?: number` (opcional, entero ≥ 0).
  - `stockUnit: StockUnit` (requerido, default `'unit'`; enum `'unit' | 'kg' | 'L'`).
  - `availability: ProductAvailability` (requerido; shape `{ pos: boolean; online: boolean; kiosk: boolean }`; defaults en Zod: `{ pos: true, online: false, kiosk: false }`).
  - `serviceSchedules: ServiceSchedule[]` (requerido, default `[]`; enum `'breakfast' | 'lunch' | 'dinner'`).
  - `allergens: Allergen[]` (requerido, default `[]`; enum fijo `'gluten' | 'dairy' | 'egg' | 'peanut' | 'tree-nut' | 'soy' | 'fish' | 'shellfish' | 'sesame'`).
  - `dietaryTags: DietaryTag[]` (requerido, default `[]`; enum fijo `'vegetarian' | 'vegan' | 'gluten-free' | 'keto' | 'halal' | 'kosher'`).
  - `modifierGroups: ModifierGroup[]` (requerido, default `[]`; embedded). Cada `ModifierGroup`: `{ id: string, name: string, required: boolean, options: ModifierOption[] }`. Cada `ModifierOption`: `{ id: string, label: string, priceDelta: number }` (puede ser negativo).
  - `kitchenStationIds: string[]` (requerido, default `[]`). FK a `kitchen-stations._id`. Validación cross-collection: cada id debe pertenecer al mismo `branchId` y `businessId` del producto (verificar en `services/products.ts` al crear/editar).
- **Campos existentes conservados**: `_id, businessId, name, description, price, category, sku, stock, isActive, createdAt, updatedAt, createdBy`. `category` permanece como **string** con el nombre de la categoría (no FK), como en el ticket.
- **Índices de `products` en `db/setup.ts`**:
  - **Eliminar**: `{ businessId: 1, sku: 1 }` único, `{ businessId: 1, category: 1, isActive: 1 }`.
  - **Crear**: `{ branchId: 1, sku: 1 }` único (mismo SKU permitido en branches distintos), `{ branchId: 1, category: 1, isActive: 1 }`, `{ businessId: 1, branchId: 1 }`.
- `db/setup.ts` es idempotente (`collMod` + `createIndex`), corre contra local, Docker y Atlas. No hay data productiva; basta correr `db:setup` para aplicar el nuevo validador + índices.
- **`db/seed.ts`** — actualizar los 10 productos seed existentes para traer `branchId: 'branch_seed_001'`, defaults razonables de los nuevos campos (`trackStock: true, stockUnit: 'unit', availability: { pos: true, online: false, kiosk: false }, serviceSchedules: [], allergens: [], dietaryTags: [], modifierGroups: [], kitchenStationIds: []`). Mantener la guarda contra Atlas (`MONGO_SECRET_ARN` / `mongodb+srv://`) y la idempotencia (skip si la business slug ya existe).

### Backend — RBAC y aislamiento

- `products:read` (admin, manager, supervisor, cashier, waiter) — ya existe en `@kaipos/shared/permissions`.
- `products:write` (admin, manager) — crear/editar + upload-url.
- `products:delete` (admin; `super_admin` bypass) — soft delete.
- **Siempre** usar `hasPermission()` / `requirePermission()`. Nunca `role === '...'` para decisiones de autorización (única excepción permitida: scoping de `super_admin` con `SUPER_ADMIN_BUSINESS_ID`).
- **Aislamiento por branch**: `GET /api/products` usa middleware `requireBranchAccess('branchId')`; `POST /api/products` usa `assertBranchAccess(user, body.branchId)` inline en el servicio (middleware no lee body); `PATCH`/`DELETE`/`GET /:id` cargan el doc y validan branch + tenant desde el documento. Cross-branch read → 404; cross-branch mutation → 403 + audit.
- **Aislamiento multi-tenant**: `super_admin` (businessId `'*'`) opera cross-tenant usando `?businessId=<id>` en list queries; resto de roles scope implícito por `actor.businessId`. Cross-tenant → 404 en read, 403 en mutación.
- Roles con `branches:manage` (admin + super_admin) pasan el check de branch sin tener el id en `branchIds` del JWT.

### Infra — AssetsStack + ApiStack

- **AssetsStack** (`infra/lib/stacks/assets-stack.ts`): agregar CORS config al bucket `kaipos-assets-prod` para permitir PUT desde el origen de CloudFront del frontend y desde `http://localhost:3000`/`http://localhost:3001` (dev). `AllowedMethods: ['PUT']`, `AllowedHeaders: ['*']`, `MaxAge: 300`.
- **ApiStack** (`infra/lib/stacks/api-stack.ts`): conceder al api Lambda `s3:PutObject` sobre `arn:aws:s3:::kaipos-assets-prod/products/*` (no sobre todo el bucket). Inyectar env var `ASSETS_BUCKET_NAME=kaipos-assets-prod` al Lambda. Local dev puede leer del mismo env var o fallback vacío (endpoint devuelve 503 si no hay bucket configurado).
- Pre-signed URL generada con `@aws-sdk/s3-request-presigner` desde el handler. Estructura de clave: `products/<branchId>/<uuid>.<ext>`. `publicUrl` se construye vía CloudFront distribution: `https://<assets-cdn-domain>/<key>` — verificar si AssetsStack ya expone una distribución CloudFront o si el bucket es sólo privado. Si es privado (BLOCK_ALL), agregar una distribución CloudFront (o Origin Access) al AssetsStack para servir las imágenes públicamente; alternativamente generar también URLs pre-firmadas de lectura de larga duración. **Decisión en planning**: definir si la lectura es pública (CloudFront dist) o con URLs firmadas.
- Sin VPC changes (Lambda sigue fuera de VPC).

### Frontend — `apps/frontend-admin`

Reglas duras (CLAUDE.md):

- Todo componente de superficie e ícono viene de `@kaipos/ui`. **Cero** imports de `@mui/material/*` o `lucide-react` directos. Verificación: `rg "from '@mui/material" apps/frontend-admin/src` → 0 matches.
- Usar `apiJson` de `src/lib/api.ts`. Mensajes de error en español, con helper `mapError()` al estilo de `UsersListPage.tsx:38`.
- Lector de auth: `useAuth()` de `src/context/AuthContext.tsx` → `{ status, user, business }`. `user.branchIds`, `user.role`, `user.businessId`.
- Tests visuales: el spec se da por cumplido cuando la página es navegable en `pnpm dev` (browser) y el golden path (crear → listar → editar → soft delete) funciona. Si `@kaipos/ui` no tiene algún primitivo (ej. `Toggle` custom del mockup), extender `@kaipos/ui` primero; nunca importar MUI en la app.

#### Branch selector (nuevo componente compartido)

- Crear `apps/frontend-admin/src/components/BranchSelector.tsx`. Props: `value: string | null, onChange: (branchId: string) => void`. Al montar, fetcha `/api/branches?businessId=...` (admin/super_admin ven todas; roles sin `branches:manage` ven sólo las de `user.branchIds`). Opciones = intersección con `user.branchIds` salvo que el usuario tenga `branches:manage`.
- Si el usuario tiene exactamente una branch y no `branches:manage`, auto-selecciona y el selector se renderiza readonly.
- Se expone también como hook `useActiveBranch()` (`apps/frontend-admin/src/hooks/useActiveBranch.ts`) que persiste el `branchId` activo en `sessionStorage` (clave `kaipos.activeBranchId`) para sobrevivir navegación. Sincroniza con la URL `?branchId=<id>` cuando se usa en páginas con la branch en querystring (products).

#### Página `/products` (list)

- Archivo: `apps/frontend-admin/src/pages/ProductsListPage.tsx`.
- Patrón: mismo state machine que `UsersListPage.tsx` — `{ status: 'loading' } | { status: 'error' } | { status: 'success', data }`.
- Header de página: `PageHeader` (local) con título "Productos", subtítulo, y un `BranchSelector` a la derecha. Si el usuario tiene múltiples branches, el cambio dispara un refetch.
- Controles: `TextField` debounced (300ms) para `q`, `Select` para `category` (opciones derivadas del set distinto de categorías en la lista actual), `Checkbox` para `includeInactive` (visible sólo si `hasPermission(user.role, 'products:write')`), botón primario "Nuevo producto" (visible si `hasPermission(user.role, 'products:write')`) que navega a `/products/new?branchId=<active>`.
- Tabla: columnas `Imagen` (thumb 40×40), `Nombre`, `SKU` (mono), `Categoría` (Chip), `Precio` (derecha, mono), `Estado` (Chip `Activo`/`Inactivo`), `Acciones` (editar si `products:write`, eliminar si `products:delete`).
- Estados: Skeleton (6 filas) / Alert con retry / `EmptyState` (icono `Inbox`) / tabla.

#### Páginas `/products/new` y `/products/:id/edit` (form)

- Archivos: `apps/frontend-admin/src/pages/ProductFormPage.tsx` (shared, detecta modo por param `:id`).
- Layout de 2 columnas replicando el mockup (`kaiPOS - Crear producto.html`): izquierda = form agrupado en `Card`s; derecha = sidebar pegajoso con preview POS + availability + imagen + ruta cocina. Breakpoint mobile: colapsa a una columna.
- Topbar de la página: breadcrumb "← Productos / <Categoría> / <Nombre|Nuevo producto>", indicador "Borrador · guardado hace Xs" (local, sin persistencia backend en Paso 10 — es un label estático por ahora; marcado como TODO inline en el código para no confundir con auto-save real), botones "Vista previa" (deshabilitado, fuera de alcance), "Guardar borrador" (deshabilitado, fuera de alcance), "Publicar producto" (primary → POST/PATCH).
- Sección "Información básica": Nombre, Categoría (Select libre con opciones = categorías existentes del branch, con opción "+ crear nueva" que permite input custom), SKU (mono, auto-generado con patrón `<CAT>-<3LETRAS-NOMBRE>-<001>` al editar el nombre por primera vez, editable; validado único por branch server-side), Descripción corta (textarea).
- Sección "Precio y costos": Precio (mono, $ prefix), Costo (mono, $ prefix, opcional), IVA (mono, % suffix, opcional). Recuadro verde con "Margen: XX%" + "Ganancia por unidad: $X.XX" calculado client-side. Si `cost` o `price` no están seteados o `price === 0`, el recuadro se oculta.
- Sección "Inventario": Toggle "Rastrear stock" (`trackStock`). Si está on: Stock actual, Alerta en (`lowStockThreshold`), Unidad (`stockUnit` select).
- Sección "Modificadores": lista de `ModifierGroup` editables (nombre del grupo, toggle Requerido/Opcional, lista de opciones con label + delta de precio). Botones "+ Grupo nuevo" y "+ Opción". Drag-and-drop del mockup **no** en alcance para Paso 10 (dejarlo como TODO visual con el ícono pero sin lógica).
- Sección "Etiquetas y alérgenos": chips de alérgenos (enum fijo) y chips de dieta (enum fijo), toggle on/off.
- Sidebar derecho:
  - **Vista en POS**: preview del tile con nombre, precio, y badge de alérgeno principal si hay `'peanut'` seleccionado (o cualquier alérgeno marcado — renderizar como chips pequeños). Lee del estado del form en vivo.
  - **Disponibilidad**: tres `Toggle` (POS, Online, Kiosko). Sección Horario con chips Desayuno/Almuerzo/Cena toggleables.
  - **Imagen**: dropzone. En drag-drop valida `≤ 2 MB` y `image/(jpeg|png|webp)`, llama `POST /api/products/upload-url`, hace PUT directo a S3 con la URL firmada, setea `imageUrl` en el form state. Muestra thumbnail cuando hay. Botón "Remover" limpia `imageUrl`.
  - **Ruta en cocina**: chips de kitchen stations del branch activo (fetch de `/api/kitchen-stations?branchId=<id>`), seleccionables (multi). Persiste como `kitchenStationIds: string[]`.
- **Modo edit**: `branchId` readonly (el field se muestra como texto informativo "Sucursal: <nombre>"). Todo lo demás editable.
- **Validación cliente**: Zod schemas compartidos entre backend y frontend vía `@kaipos/shared` (opcional — si el backend ya expone los mismos schemas, considerar exportarlos desde un subpath `@kaipos/shared/schemas/products`). Mínimo: client-side valida required fields antes del submit; server-side es la autoridad.
- **Errores**: mapear 409 (SKU duplicado) a un error inline en el campo SKU ("Este SKU ya existe en esta sucursal"). 403 → banner "No tienes permiso...". Otros → banner genérico.

#### Routing y gating

- En `App.tsx`, dentro del bloque con `RequireAuth` + `AppLayout`:
  - `<Route element={<RequirePermission permission="products:read" />}>` envuelve `/products`, `/products/new`, `/products/:id/edit`.
  - `/products/new` y `/products/:id/edit` adicionalmente requieren `products:write` — usar un segundo `RequirePermission` anidado o un guard inline que redirige a `/products` si falla.
- En `Sidebar.tsx`, agregar `{ label: 'Productos', to: '/products', icon: <icono de @kaipos/ui>, permission: 'products:read' }`. Ícono: agregar `Package` (o similar) al re-export de `@kaipos/ui` si no existe.

### Tests (Vitest)

- **Backend — `services/products.test.ts`**: multi-tenant (cross-business → 404), multi-branch (usuario de branch A no ve/edita/elimina productos de branch B → 404 read, 403 mutación con audit log), denial 403 + audit para permisos insuficientes, soft delete preserva el doc con `isActive: false` + `includeInactive=true` lo devuelve, búsqueda por nombre y SKU case-insensitive, filtro por categoría, SKU duplicado en mismo branch → 409, **mismo SKU en branches distintos → permitido**, `super_admin` cross-tenant, `admin` (con `branches:manage`) operando sobre cualquier branch sin tenerlo en `branchIds`, validación cross-collection de `kitchenStationIds` (ids de otra branch → error).
- **Backend — `routes/products.test.ts`**: codes HTTP correctos (201 create, 200 read/list/update, 204 delete), `requireBranchAccess` gateando `GET /api/products`, `assertBranchAccess` inline en `POST`, pre-signed URL endpoint (201 con shape correcto, 400 si contentType fuera de enum, 400 si fileSize > 2MB, 403 + audit si no `products:write`).
- **Frontend** (opcional, smoke tests): render de `ProductsListPage` en estados loading/error/success/empty con mocks de `apiJson`; render de `ProductFormPage` modo `new` y modo `edit`; cálculo de margen reactivo.

## Acceptance Criteria

- [ ] Admin crea un producto dentro de una branch seleccionada y aparece en la lista de esa branch inmediatamente.
- [ ] Admin edita el precio y el cambio se persiste; al recargar, el nuevo precio está presente.
- [ ] Admin elimina un producto (soft delete → `isActive: false`); por defecto desaparece del listado y reaparece con `includeInactive=true`.
- [ ] Cajero ve productos de su branch pero **no** ve botones crear/editar/eliminar; los endpoints de mutación le devuelven 403 con audit log `authorization_failed`.
- [ ] Manager puede crear/editar pero **no** eliminar (403 + audit en `DELETE`).
- [ ] Productos del negocio A no aparecen para el negocio B (404 cross-tenant en `GET /api/products/:id`).
- [ ] Productos del branch A no aparecen para un usuario asignado sólo al branch B del mismo negocio (404 cross-branch read; 403 + audit en mutación cross-branch).
- [ ] Usuario con múltiples branches puede cambiar el `BranchSelector` y ver catálogos independientes por branch.
- [ ] Admin / super_admin (con `branches:manage`) pueden operar sobre cualquier branch sin tenerla en su `branchIds`.
- [ ] Búsqueda funciona por nombre y SKU (case-insensitive), scoped al `branchId` activo.
- [ ] Filtro por categoría funciona, scoped al `branchId` activo.
- [ ] Tipo `Product` y validador `$jsonSchema` incluyen todos los campos nuevos (`branchId`, `imageUrl?`, `cost?`, `taxRate?`, `trackStock`, `lowStockThreshold?`, `stockUnit`, `availability`, `serviceSchedules`, `allergens`, `dietaryTags`, `modifierGroups`, `kitchenStationIds`).
- [ ] Índices nuevos aplicados: `{ branchId, sku }` único, `{ branchId, category, isActive }`, `{ businessId, branchId }`. Índices viejos eliminados.
- [ ] SKU duplicado dentro del mismo `branchId` devuelve 409; mismo SKU en branches distintos es permitido.
- [ ] `db:seed` inserta productos con `branchId` de la sucursal seed, defaults de los nuevos campos, y sigue siendo idempotente + refusa correr contra Atlas.
- [ ] `POST /api/products/upload-url` devuelve una URL pre-firmada válida; el frontend sube una imagen JPG/PNG/WebP ≤ 2 MB, la URL pública se persiste como `imageUrl` al publicar el producto, y la imagen se renderiza como thumb en la lista y en el preview POS.
- [ ] Formulario edit tiene `branchId` readonly; no se puede mover un producto entre branches.
- [ ] Cálculo de margen reactivo (cambias precio o costo → el recuadro verde actualiza en vivo) y se oculta cuando `price === 0` o `cost` vacío.
- [ ] Visualmente, la página `/products/new` se aproxima al mockup `kaiPos (2)/kaiPOS - Crear producto.html` (layout form+sidebar, cards agrupadas, paleta teal/slate) construida íntegramente con `@kaipos/ui`.
- [ ] Sin imports de `@mui/material/*` ni `lucide-react` en `apps/frontend-admin/src` (verificable con `rg`).
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm --filter @kaipos/backend test` pasan.

## Out of Scope

- **Colección compartida de modificadores** (reutilización cross-producto). Paso 10 los embebe en el doc del producto; una futura migración a collection + FK queda para un ticket aparte.
- **Categorías como recurso**. `category` sigue siendo un string libre. CRUD de categorías + FK queda para un ticket aparte.
- **Auto-save real** del formulario. El label "Borrador · guardado hace Xs" es decorativo en Paso 10 — marcar con `TODO` en el código.
- **Vista previa del producto** (botón "Vista previa" en el topbar del form) — botón visible pero deshabilitado.
- **Guardar borrador** como estado separado de un producto publicado. Paso 10 sólo tiene publicado (isActive:true) / desactivado (isActive:false). El botón queda visible pero deshabilitado.
- **Drag-and-drop de orden de modificadores** (el ícono `⋮⋮` del mockup). Los grupos/opciones se renderizan en orden de inserción.
- **Alertas reales de low-stock** (notificaciones, emails, KDS). El spec sólo persiste `lowStockThreshold` y `trackStock`; el consumer vendrá después.
- **Eventos WebSocket** de `product.created` / `product.updated` / `product.deleted`. Paso 10 no emite eventos de productos; los clientes se enteran por refetch. Una vez el POS esté vivo y necesite invalidación push, se agrega en otro ticket.
- **Importación masiva** / CSV upload de productos.
- **I18n del backend**: los mensajes de error del backend siguen en inglés (consistente con el resto de la API); la traducción al español vive en el frontend via `mapError()`.

## Open Questions

- **AssetsStack: pública o firmada?** El bucket `kaipos-assets-prod` tiene `BLOCK_ALL` public access. Para servir `imageUrl` a los clientes tenemos dos caminos: (a) agregar una distribución CloudFront (o sub-behavior en la distribución del frontend) con Origin Access al bucket y rutas `products/*` públicas vía CDN; (b) generar URLs pre-firmadas de lectura (TTL largo, p.ej. 7 días) y renovarlas on-access. Decisión a tomar durante `/kaipos.plan` — tiene impacto en infra y en cómo el frontend renderiza imágenes. Recomendación preliminar: opción (a) porque las imágenes de menú son públicas por naturaleza (el menú online las servirá sin auth).
- **Kitchen stations en `/products/new` cuando aún no hay ninguna configurada en el branch**. ¿Sección vacía con hint "Configura estaciones en KDS primero"? ¿Link directo a crear station? Decidir UX durante plan/implementación.
- **Shape del error 409 de SKU duplicado**: ¿devolver `{ code: 'SKU_ALREADY_EXISTS', field: 'sku' }` para que el frontend lo mapee a error inline? Backend `users` no tiene un patrón 409 — definir la convención.
- **Zod schemas compartidos**. Valorar si vale la pena exportar los schemas de `apps/backend/src/schemas/products.ts` desde `@kaipos/shared/schemas/products` para reuso en el frontend, o si es simpler duplicar la validación mínima client-side. No bloquea la implementación.
- **`DELETE` semantics en tests**: ¿confirmamos 204 No Content (patrón REST) o 200 con body? Revisar `routes/users.ts::deactivateUser` durante plan.
