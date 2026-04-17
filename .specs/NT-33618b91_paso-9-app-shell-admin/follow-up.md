# Follow-up Tasks

Source: `.specs/NT-33618b91_paso-9-app-shell-admin/`

<!-- Items discovered during planning that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [ ] **Business picker para super_admin** — el header muestra "Admin global" pero super_admin necesita seleccionar un business activo para ver datos scoped; diseñar dropdown + persistencia en storage.
- [ ] **CRUD de usuarios en `/users`** — esta iteración solo lista; agregar crear/editar/borrar/reset-password con las APIs ya existentes y respetando restricciones del manager (roles asignables limitados).
- [ ] **Pantallas de forgot / reset password** — los endpoints `POST /api/auth/forgot-password` y `/reset-password` existen pero la UI no.
- [ ] **Optimización móvil (< 600px)** — esta iteración cubre desktop + tablet; validar y ajustar para móvil cuando se defina soporte.
- [ ] **Promoción de componentes a `@kaipos/ui`** — `EmptyState`, `PageHeader`, `Sidebar`, `WsStatusChip` nacen locales; promoverlos cuando exista un segundo consumer (POS/kitchen) para evitar duplicación.
- [ ] **Evaluar `react-hook-form` + `zod`** — formularios futuros (CRUD de users, productos, órdenes) se beneficiarán; hoy el login con state local basta.
- [ ] **Evaluar `@tanstack/react-query`** — cuando la app crezca en cantidad de fetches y cacheo, considerar migrar `api.ts` a query/mutations para dedupe y revalidación.
- [ ] **Centralizar manejo de 401 en `api.ts` vs AuthContext** — hoy el refresh vive en `api.ts` y el redirect a login ocurre ahí mismo; revisar si conviene emitir un evento hacia el contexto para mantener la capa HTTP pura.
- [ ] **Consolidar imports: shim de `permissions.ts` en backend** — si en Phase 1 se elige el re-export shim, migrar imports a `@kaipos/shared` en un cleanup posterior y borrar el shim.
