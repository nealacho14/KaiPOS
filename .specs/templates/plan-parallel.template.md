# Plan: <task_title>

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Notion Ticket  | [NT-<short_id>](https://notion.so/<notion_page_id_without_dashes>) |
| Spec           | `.specs/NT-<short_id>_<task_slug>/spec.md`                         |
| Feature Branch | `NT-<short_id>/<task_slug>/feature`                                |
| Target         | `main`                                                             |

<!-- Multi-phase parallel plan. Independent phases can be implemented simultaneously
     in separate worktrees using `/kaipos.implement-parallel`.
     Dependent phases must wait until their dependencies are merged. -->

## Phase Status

| Phase   | Slug           | Status  | Depends on | Unblocks |
| ------- | -------------- | ------- | ---------- | -------- |
| Phase 1 | `<phase_slug>` | pending | none       | Phase 2  |
| Phase 2 | `<phase_slug>` | blocked | Phase 1    | —        |

## Dependency Graph

```
Phase 1 ──→ Phase 2
```

---

## Phase 1: <phase_title>

**Branch**: `NT-<short_id>/<task_slug>/<phase_slug>`
**Base**: `NT-<short_id>/<task_slug>/feature`
**Depends on**: none

### Tasks

- [ ] ...
- [ ] ...

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] Manual verification: <describe>

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## Phase 2: <phase_title>

**Branch**: `NT-<short_id>/<task_slug>/<phase_slug>`
**Base**: `NT-<short_id>/<task_slug>/<dependency_phase_slug>`
**Depends on**: Phase 1

### Tasks

- [ ] ...
- [ ] ...

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` succeeds
- [ ] Manual verification: <describe>

<!-- PHASE GATE — Do NOT proceed past this point until all boxes above are checked. -->

## QA Plan

- [ ] ...
- [ ] ...
