Run verification and tick off each checkbox in the plan file as it passes:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes (run `pnpm format` to auto-fix if needed)
- [ ] `pnpm build` succeeds

If any step fails, fix the issue before proceeding. Do NOT skip verification steps.

For changes with user-facing behavior, also describe a **manual smoke test** (what to run, what to check, expected outcome) and ask the user to confirm it passes.
