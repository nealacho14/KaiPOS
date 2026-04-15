# Follow-up Tasks

Source: `.specs/NT-33618b91_api-middleware-logging/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [ ] Add `pino-pretty` as a dev dependency and pipe local dev output through it for human-readable logs during development (`pnpm dev` script)
- [ ] Add shared-secret header check in Lambda to prevent direct API Gateway access bypassing CloudFront (noted in CLAUDE.md as a pending security measure)
- [ ] Health endpoint duplicates DB ping logic between `index.ts` and `functions/health.ts` — after unification in Phase 3, consider extracting the health check logic into a reusable service function
- [ ] `db/setup.ts` console.log replacement will produce JSON output in the terminal — consider a `LOG_FORMAT=pretty` flag or `pino-pretty` transport for CLI scripts specifically
