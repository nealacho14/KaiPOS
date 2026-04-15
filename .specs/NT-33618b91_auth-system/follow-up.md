# Follow-up Tasks

Source: `.specs/NT-33618b91_auth-system/`

<!-- Items discovered during implementation that are out of scope but worth tracking.
     Each item should explain what and why in one line. -->

- [x] AWS SES integration for password reset emails — current implementation logs the token; real email delivery needs SES setup + verified domain
- [x] Add `branchIds` to existing seed/test user data — DB setup and seeds may not include the new field, causing branch middleware to fail on legacy data
- [x] Audit logging for auth events — login, logout, failed attempts, password resets should be tracked for security monitoring (CloudWatch or dedicated collection)
