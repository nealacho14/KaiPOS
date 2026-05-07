# Follow-up Tasks

Source: `.specs/NT-33618b91_phase-1-e2e-validation/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [x] **Documentar provisión y workflow del ambiente staging en el repo** — el repo solo tiene `deploy:prod`; staging existe pero está sin CDK stack ni workflow versionado. Riesgo: divergencia silenciosa entre prod y staging y dependencia de configuración fuera del repo.
- [x] **Unificar `db:seed` y `db:seed-cypress` bajo un sistema de fixtures por env** — hoy son dos scripts separados con duplicación de patrones (UUIDs estables, `hashPassword`, índices). Una sola fuente con flags `--dataset=demo|cypress|empty` reduciría la deriva.
- [x] **Auditar y añadir `data-testid` estables en el SPA admin** — Cypress depende de selectores; sin testids el costo de cada cambio de UI sube. Pase posterior por `Header`, `Sidebar`, formularios principales y tablas de listado.
- [x] **Tests de integración server-side para auth contra Mongo real** — los `*.test.ts` actuales mockean el service. Cypress cubre el flujo browser, pero un nivel intermedio (Vitest + DB real) atrapa regresiones más rápido y sin staging.
- [x] **Sharding/paralelización de Cypress en CI** — si el tiempo crece sobre 3 min al añadir más suites en fases futuras, dividir specs por matrix de GH Actions o evaluar Cypress Cloud. No bloquea hoy pero el budget es ajustado.
- [x] **Verificar comportamiento de `origin-verify` contra staging** — el middleware deja pasar requests sin `x-origin-verify` cuando no hay `CLOUDFRONT_SECRET`. En staging, ¿el secret está activo y CloudFront lo inyecta? Si lo está, Cypress no tiene cómo enviarlo al pegarle directo al backend; si las suites lo hacen via SPA solo (no llamadas directas al backend) está bien, pero documentarlo.
