# Follow-up: NT-33618b91 Esquema Base de Datos Core

## Pre-commit hook broken: lint-staged + ESM + Node 18

**Found during**: Phase 1 implementation
**Severity**: Medium — blocks all commits unless `--no-verify` is used
**Root cause**: The root `eslint.config.js` uses ESM `import` syntax, but the root `package.json` lacks `"type": "module"`. When lint-staged runs `eslint --fix` directly (outside turbo), Node 18 treats `.js` as CJS and fails with `SyntaxError: Cannot use import statement outside a module`.
**Fix options**:

1. Add `"type": "module"` to root `package.json`
2. Rename `eslint.config.js` to `eslint.config.mjs`
3. Upgrade to Node 20+ (which may help but isn't the root fix — the `type` field is still needed)
