# Plan: <task_title>

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Notion Ticket  | [NT-<short_id>](https://notion.so/<notion_page_id_without_dashes>) |
| Spec           | `.specs/NT-<short_id>_<task_slug>/spec.md`                         |
| Feature Branch | `NT-<short_id>/<task_slug>/feature`                                |
| Target         | `main`                                                             |

<!-- Multi-phase sequential plan. Phases are stacked — each targets the previous phase's branch.
     Phase 1 branch targets the feature branch; subsequent phases target the previous phase.
     Use `/kaipos.implement` to implement one phase at a time. -->

## Phase 1: <phase_title>

**Branch**: `NT-<short_id>/<task_slug>/<phase_slug>`
**Targets**: `NT-<short_id>/<task_slug>/feature`

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
**Targets**: `NT-<short_id>/<task_slug>/<previous_phase_slug>`

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
