# Latest task dates and sorting fix — 9 November 2026

## What caused the problem

The supplied `campus-action-engine-final (2).zip` was used as the baseline. Its existing OAuth error handling, Gmail batching and other audit changes were retained. The `occurredAt` schema/pipeline additions and Gmail query removal described in the request were not actually present in that ZIP or the local workspace.

The complete path was checked: Google adapters → normalizer → extractor → decision pipeline → upsert → MongoDB → REST routes → React hook → dashboard/cards.

1. The normalizer already supplied source dates, but `runPipeline()` dropped them and the Task schema had no `occurredAt` field. MongoDB therefore could not retain the dates through this path. The extractor handles academic facts; it does not need to extract receipt dates from message text.
2. Both `listTasks()` and React's initial filters explicitly sorted All Tasks by `priorityScore`. The old “Newest” option used MongoDB `createdAt`, which is the import time, not the email/Classroom date.
3. The High Priority feed deliberately sorts by priority. Overdue assignments receive urgency 100 under the existing scoring rules. Consequently, an August task in that section is not evidence of a failed November sync.
4. Existing tasks are retained and refreshed by owner + source + source ID. `New: 0, Refreshed: 104` means those recognized records already existed; it does not by itself mean nothing was fetched. The reported 131 fetched items include both services, not 131 Gmail messages. Classification still ignores irrelevant messages and the default feed still filters ineligible opportunities.
5. The old Gmail adapter read only one page, applied `newer_than:30d` when no query was supplied, and the sync service inferred truncation merely from a full page. A 30-day filter would normally include current November messages, so it does not explain the old priority feed. It has nevertheless been removed as requested.

## Files changed relative to the supplied ZIP

| File | Change |
| --- | --- |
| `backend/src/models/Task.js` | Added nullable Date `occurredAt`. |
| `backend/src/services/decision/pipeline.service.js` | Carries the normalized source date into the task candidate; missing/invalid dates become null. Scoring logic is unchanged. |
| `backend/src/services/task.service.js` | All Tasks defaults to source date descending; computes `occurredAt ?? createdAt` in MongoDB before pagination. Retains owner/eligibility filters, stable ID ties and optional existing sorts. Existing upsert already `$set`s all candidate facts, so it now inserts/refreshes `occurredAt` while preserving status. High Priority and Upcoming sorting are unchanged. |
| `backend/src/services/google/gmail.service.js` | Removes implicit date filtering, honors explicit queries, follows short pages up to the configured limit, deduplicates IDs and sorts fetched messages by receipt date. Keeps batches of 10 and the existing array API response. Exposes pagination metadata to sync. |
| `backend/src/services/sync.service.js` | Uses actual next-page metadata for the import notice. Counts still represent fetched, created, updated, ignored and failed items. |
| `frontend/src/hooks/useTasks.js` | Defaults to source date descending; returns to page 1 after sync while retaining user-selected filters/sort. |
| `frontend/src/components/TaskFilters.jsx` | Adds “Latest source date”; renames the old createdAt option “Import date”. |
| `frontend/src/components/TaskSourceDate.jsx` | Shared date display: Gmail “Received”, “Classroom date”, or clearly labelled fallback import date. |
| `frontend/src/components/TaskCard.jsx` | Displays the source date in every section using existing styles. |
| `frontend/src/components/TaskDetailDrawer.jsx` | Displays the same date separately from the deadline. |
| `frontend/src/components/DashboardPage.jsx` | Clarifies each section's ordering and uses the post-sync page reset. Layout/CSS retained. |
| `frontend/src/components/SyncPanel.jsx` | Awaits the dashboard reload after sync. |
| `backend/test/unit.test.js` | Tests source-date propagation for Gmail, Classroom coursework and announcements, plus missing/invalid dates. |
| `backend/test/google-adapters.test.js` | Tests query handling, bounded pagination, ID deduplication, newest-first date order, batching and exact-limit versus actual-more-results cases. |
| `backend/test/integration.test.js` | Exercises real disposable MongoDB + REST: November versus August ordering, null/missing dates, ascending/descending pagination, high priority, date backfill/update, status preservation, filters, counts and no duplicates. |
| `README.md`, `CHANGELOG.md`, `LATEST_TASKS_FIX.md` | Updated behavior, verification and recovery instructions. |

No CSS, dependencies, OAuth settings, classification rules, eligibility rules, importance/urgency/priority formulas or Classroom API adapter behavior changed relative to the supplied ZIP. No existing MongoDB records were deleted or rewritten as a migration, and no live mailbox sync was performed during this fix.

## Re-sync and verify in VS Code

1. Use the updated local `campus-action-engine` folder. If using the accompanying fixed ZIP elsewhere, keep that installation's existing `backend/.env` and MongoDB data directory; the ZIP intentionally excludes credentials and database files.
2. Stop the old backend/frontend terminals with Ctrl+C and restart them from the project root:
   - Backend: `npm.cmd --prefix backend start`
   - Frontend, separate terminal: `npm.cmd --prefix frontend run dev`
   Keep your existing MongoDB running. The Node dependency files have not changed from the supplied ZIP; a fresh extraction still needs `npm.cmd --prefix backend ci` and `npm.cmd --prefix frontend ci`.
3. Open `http://localhost:3000`, reload the page, sign in if needed, and click **Sync Gmail & Classroom**.
4. Scroll to **All Tasks**. Use **Latest source date**, **Descending**, page 1. Clear status/category/priority filters; choose **Show all opportunities** if you also want ineligible items.
5. Compare a recognized academic email among the mailbox's newest 50 messages with its **Received** date. Check a recent Classroom item against its **Classroom date** (update time when available). November source dates should sort before August source dates regardless of priority score.
6. Critical / High Priority may still show August overdue assignments first. Their source date and deadline are now separate. Mark completed work complete if appropriate; syncing preserves that status.
7. Sync again: unchanged sources should count as refreshed, not new, and task counts should remain stable. A changed Classroom item should acquire its revised source date.

**Existing records need re-syncing to recover their true source dates.** Each fetched record is updated by its existing source ID. Records outside the bounded Gmail import remain untouched and use their original import date until fetched again. The fallback is explicitly labelled; it is not claimed to be the original message date. For historical backfill, the existing sync REST endpoint accepts a targeted `gmailQuery`, for example `after:2026/08/01 before:2026/09/01`, and `gmailMaxResults` up to 100. No database reset is needed.

## Gmail limit notice and API boundary

The default import takes up to 50 message references from Gmail's result pages, then fetches and orders their contents by `internalDate`. It excludes Spam/Trash under Google's default behavior and applies only an explicitly supplied Gmail query. It does not scan every message in a mailbox. Google exposes no `orderBy` parameter or explicit newest-first guarantee on `messages.list`; sorting the fetched batch makes local ordering deterministic, but cannot prove that Google selected the globally newest 50 from an arbitrary mailbox. Compare with the connected Gmail account during live verification. See [Google messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) and [message internalDate](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages).

The notice **“More messages match this query; they were not fetched in this sync”** is expected when Google supplies `nextPageToken`. It indicates bounded coverage, not failure. Exactly 50 messages with no next page no longer triggers a warning. The limit applies before academic classification, so 50 fetched emails may produce fewer than 50 tasks. Existing records are retained, including old tasks no longer in that batch.

## Verification completed

- `npm.cmd --prefix backend test`: 21 tests passed.
- `npm.cmd --prefix backend run test:integration`: 15 regression scenarios passed (16 TAP tests including the parent suite), using a disposable MongoDB process and test-only Google responses.
- `npm.cmd --prefix frontend run lint`: passed.
- `npm.cmd --prefix frontend run build`: passed.
- React server-render checks: cards/details display source date and fallback import date correctly; Latest source date is the selected sort.

These checks validate the implementation and persistence without touching your mailbox or application database. Actual November inbox contents and school-account access were not verified in this run.
