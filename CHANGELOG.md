# Latest task dates and sorting — 9 November 2026

Preserved the supplied ZIP's existing audit changes and fixed source-date persistence, latest-first All Tasks sorting with legacy fallback, Gmail pagination/query handling, accurate limit notices and visible source dates. Priority scoring and the High Priority order remain unchanged. Re-sync backfills source dates for records fetched again; existing database records are retained.

Verified: 21 unit/adapter tests, 15 disposable-MongoDB REST regression scenarios, frontend lint/build and rendered card/detail/date-sort checks. No live inbox sync was performed. See [LATEST_TASKS_FIX.md](LATEST_TASKS_FIX.md) for root cause, file-by-file changes and verification steps.

# Audit and hardening — 9 November 2026

Audited the delivered code against the resume. No LLM, model-provider, MCP, Drive, WebSocket, scheduler or demo-login code was present in source, dependencies or configuration. Authentication is Google OAuth with hashed server-side sessions; every protected route and task/profile query is owner-scoped.

Fixes made:

- Gmail import now fetches message bodies in batches of 10 (`utils/mapInBatches.js`) instead of up to 100 simultaneous requests, which could trigger Gmail rate-limit errors on real mailboxes.
- A failure during the Google callback (code exchange, profile lookup, linking, session creation) now redirects to the login screen with a message and creates no session. Previously the browser showed a raw JSON error page.
- `CLIENT_URL` is normalized to remove trailing slashes so CORS and redirects match exactly.
- Corrected a stale comment in `auth.service.js`.
- Documented Google's restricted-scope rules (test-user cap, 7-day refresh-token expiry, verification) in GOOGLE_SETUP.md, README and PROJECT_GUIDE.md.

Verification in this audit environment (no network, no MongoDB):

- 15 parser, scoring, timezone, validation and batching unit tests passed.
- The patched OAuth callback was exercised with stubbed collaborators for: success, invalid state, Google API error, unexpected error, and user-denied consent.
- The patched Gmail adapter was exercised with a stubbed Google client: 25 messages, order preserved, peak concurrency 10.
- Not run here: the Google-adapter tests (need the `googleapis` package), the MongoDB integration suite (needs `mongod`; one new test was added for the failed-sign-in path and is syntax-checked only), frontend lint/build, and live Google sign-in. Run `npm --prefix backend test`, `npm --prefix backend run test:integration`, `npm --prefix frontend run lint` and `npm --prefix frontend run build` on your machine.

# Resume alignment revision

## Scope

Retained React, JavaScript, Node.js, Express REST APIs, MongoDB, Gmail and Google Classroom. Replaced model extraction with an explicit JavaScript parser. Removed model-provider dependencies/configuration, MCP, Drive search/upload, realtime sockets and scheduled deadline jobs. Simplified profile personalization to branch, CGPA, graduation year and category preferences.

## Correctness and access fixes

- Removed unauthenticated profile creation and blocked updates to email/Google identity and database operators.
- Require a verified Google email when resolving an OAuth profile.
- Retained hashed sessions, encrypted Google credentials, owner-filtered data access and added browser origin checks for mutations.
- Preserve Classroom UTC due times and distinguish source IDs across courses/item types.
- Read all supported Classroom pages, including older published assignments.
- Parse HTML-only Gmail message text.
- Retain overdue tasks and exclude completed/dismissed tasks from urgent views.
- Update revised source facts on sync without resetting task status; prevent duplicates under concurrent imports.
- Re-evaluate eligibility and priority on reads so profile changes and elapsed time affect current filters and ordering.
- Treat incomplete/unsupported eligibility as needing review.
- Validate list, sync and profile inputs; show sync errors and parsing warnings in the interface.
- Remove expired UI data when signing out; prevent stale network responses from replacing newer filter results.
- Require Google sign-in; demo routes and runtime fixture imports have been removed.
- Update packages with npm security fixes.

## Validation and boundaries

Verified on 6 November 2026:

- 17 parser, decision, validation and simulated Google-adapter tests passed.
- 10 REST scenarios against a real, temporary MongoDB instance passed (11 reported tests including their parent suite).
- React production build and frontend lint passed.
- Earlier browser checks covered the dashboard layout and task actions using test data. These are not verification of live Google account access.
- npm audits reported zero known vulnerabilities for the installed backend and frontend dependency trees.

Google account credentials were not supplied; live OAuth consent, token refresh against Google and real inbox/Classroom imports are not certified by the automated tests.

Use a fresh MongoDB database name when evaluating this revision beside an older installation. Existing databases are not deleted or migrated automatically. Old generated task facts are not retroactively re-parsed until their source records are imported again; legacy Classroom IDs may produce new records on first import with the corrected ID format.

## Delivery

Changes were prepared locally on branch `fix/resume-aligned-scope`. No remote commits were pushed. The accompanying source ZIP excludes credentials, installed dependencies, temporary databases and Git metadata. The Git patch targets the original checked-out repository revision.

## Google-only update — 7 November 2026

Removed the demo profile/login, sample-mode UI, configuration switch and all runtime fake-data branches. Fixtures now exist only under backend/test. Old non-Google sessions are rejected without deleting existing databases. The local encryption key was generated without exposing it. Google client credentials must be supplied by the owner; live verification remains pending.

Reverified after removal: 17 unit/adapter tests, 13 MongoDB integration scenarios (14 reported tests including the parent), frontend lint and the production build all passed. The OAuth callback test verifies state rejection, encrypted credential storage and hashed sessions using test-only substituted Google responses. Startup correctly rejects missing Google credentials rather than falling back to sample data.
