### Follow-up awareness

While implementing, actively watch for issues that are **out of scope but worth tracking**:

- **Duplication** — code that could be extracted into shared functions or modules
- **Shallow modules** — large interfaces hiding thin implementations
- **Feature envy** — logic that lives far from the data it operates on
- **Hard-to-test code** — tight coupling, hidden dependencies, side effects
- **Missing tests** — areas where a test framework would catch real bugs
- **Technical debt** — patterns that the new code reveals as problematic

**Threshold**: Log it as a follow-up when it's:

- Not required for the current task to work correctly
- Would improve code quality but isn't blocking
- Requires effort beyond the current scope

If it's a quick fix and directly related, just do it. Otherwise, note it in `.specs/NT-<short_id>_<task_slug>/follow-up.md` (create using the follow-up template if it doesn't exist).
