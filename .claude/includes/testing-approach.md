### Testing approach

No test framework is currently configured in KaiPOS.

For verification, rely on:

1. TypeScript type checking (`pnpm typecheck`)
2. ESLint (`pnpm lint`)
3. Prettier formatting (`pnpm format:check`)
4. Build verification (`pnpm build`)
5. Manual verification (curl commands, browser testing)

When implementing, **structure code to be testable** (pure functions, dependency injection, separation of concerns) so tests can be added later without refactoring.

If the change is significant enough to warrant tests, add a follow-up item:

> "Set up test framework and add tests for `<feature>`"
