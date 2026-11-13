# Campus Action Engine

A campus information and task management platform using **JavaScript, React, Node.js, Express, REST APIs and MongoDB**.

It imports Gmail messages and Google Classroom coursework/announcements, organizes academic tasks and opportunities, and prioritizes them using explicit eligibility, category and deadline rules.

## Resume scope

| Project claim | Implementation |
| --- | --- |
| Collect and structure academic information from Gmail and Google Classroom | Read-only Google API adapters, a shared normalizer, a JavaScript text parser and a sync REST endpoint |
| Personalized relevance and prioritization | Branch/CGPA/graduation-year checks, preferred categories, deadline urgency and an explained weighted score |
| REST APIs and MongoDB with secure user-scoped access | Google sign-in, cookie sessions, owner-filtered database queries, profile validation and task status updates |

There is no LLM, model API, MCP endpoint, Google Drive integration, WebSocket connection or scheduled background job. Priority is recalculated when the dashboard is loaded/refreshed. There are no AI-generated summaries: task descriptions are source excerpts.

**Start learning with [PROJECT_GUIDE.md](PROJECT_GUIDE.md).** [CHANGELOG.md](CHANGELOG.md) records the corrections and verification.

## What you can do

- Sign in with Google and import your own Gmail/Classroom information.
- Set your branch, CGPA, graduation year, timezone and preferred categories.
- View urgent tasks, upcoming deadlines, and all tasks with filtering and pagination.
- Inspect the source excerpt, original link, eligibility reasons and priority calculation.
- Mark tasks completed/dismissed or reopen them through REST APIs.
- Re-sync revised source records without duplicating tasks or losing your task status.
- Sign in only through your real Google account. There is no demo login or fallback data.

## Requirements and setup

- Node.js 22.12 or later and npm.
- MongoDB running locally, or a MongoDB connection URI.
- Google OAuth credentials. Follow [GOOGLE_SETUP.md](GOOGLE_SETUP.md) before starting the backend.

Install dependencies from the repository root:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env`. Do not commit this file.

### Run in VS Code after configuring Google

Open the repository folder in VS Code. The backend requires your real Google client ID, client secret and token encryption key; it stops with a clear error if these are missing.

In the VS Code Command Prompt terminal, start MongoDB if it is not already running:

```cmd
mkdir backend\tmp\local-db
"C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" --dbpath backend/tmp/local-db --bind_ip 127.0.0.1 --port 27017
```

In a second terminal run `npm.cmd --prefix backend start`. In a third terminal run `npm.cmd --prefix frontend run dev`.

Open [localhost:3000](http://localhost:3000), click **Sign in with Google**, grant the requested read-only permissions, complete your profile and click **Sync Gmail & Classroom**. An empty account or an account with no matching academic records produces an empty dashboard, not fictional tasks.

### Connect real Gmail and Google Classroom

1. In [Google Cloud Console](https://console.cloud.google.com/), select a project and enable **Gmail API** and **Google Classroom API**.
2. Configure OAuth consent, including yourself as a test user when applicable.
3. Create an OAuth client of type **Web application**. Register the exact redirect URI `http://localhost:5000/api/auth/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in `backend/.env`.
5. Generate a token encryption key once and set `TOKEN_ENCRYPTION_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

6. Restart the backend and sign in with Google. There is no mode switch: the application always uses Google APIs.

Google permissions are centralized in `backend/src/config/googleScopes.js`: identity, Gmail read-only, courses read-only, announcements read-only and the student's own coursework read-only. Keep the encryption key stable; replacing it makes previously stored Google credentials unreadable and requires reconnection.

If you previously authorized the old version's broader permissions, revoke the old app grant from your Google Account and reconnect to this revision. Removing a scope from code does not itself revoke an existing Google grant.

Gmail imports use the authenticated mailbox and fetch up to 50 messages by default, with no application-imposed date query. An explicit `gmailQuery` is honored. Short pages are followed until the limit or end of results; message bodies are fetched in batches of 10 and sorted newest first using Google's `internalDate`. A limit notice appears only when Google supplies a next page token. This is a bounded import, not a full mailbox scan; see [Google's messages.list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list).

All Tasks defaults to source date descending (`occurredAt`, falling back to `createdAt` for older records). Gmail uses receipt time; Classroom uses update time, falling back to creation time. Critical / High Priority remains sorted by priority score, so older overdue work can still appear there. Cards and details distinguish source dates from fallback import dates. See [LATEST_TASKS_FIX.md](LATEST_TASKS_FIX.md) for the fix, file list and verification steps.

Classroom imports paginate published records, including older assignments, from up to 20 active courses. A collection is limited to 1,000 records per import and returns an explicit error above that limit. Classroom due dates and times are interpreted in UTC, as specified in [Google's CourseWork reference](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork).

Who can sign in is controlled by your Google Cloud project's status: Testing mode allows only listed test users, and public access to Gmail read permission requires Google verification. See "Who can sign in?" in [GOOGLE_SETUP.md](GOOGLE_SETUP.md).

Live Google sign-in/import must be checked with your own configured account. Automated checks substitute Google responses only inside test files. Application code never imports those fixtures. Automated tests do not prove access to your real inbox or courses.

## Architecture

```text
React dashboard
    -> Express REST route
    -> session authentication
    -> Gmail / Classroom adapter
    -> common record shape
    -> JavaScript rules extract facts
    -> eligibility + category relevance + deadline urgency
    -> MongoDB task belonging to the signed-in user
    -> REST response -> React dashboard
```

Supporting packages stay within this stack: Mongoose is the MongoDB data-model library, googleapis is Google's Node.js API client, and Vite builds the React frontend. Node's built-in crypto protects tokens and Node's built-in test runner runs tests.

## Rules and limits

### Parsing

Recognizes academic categories using keyword rules: assignments, exams, jobs, internships, scholarships, registrations, events and academic announcements. Classroom coursework is an assignment. Generic messages without an academic match and promotional subjects are ignored.

Explicit supported eligibility examples:

```text
Eligible branches: Mining, CSE
Minimum CGPA: 8
Graduation year: 2027
```

Supported labelled deadline examples:

```text
Deadline: 2027-12-20
Due: 20 December 2027
Apply by December 20, 2027
Deadline: 2027-12-20T17:00:00+05:30
```

Date-only email deadlines mean end of day in the profile timezone. Ambiguous formats, relative dates and unsupported time expressions remain unset with a review warning. Attachments, images and arbitrary natural-language eligibility conditions are not interpreted. A source excerpt is limited to 600 characters; the original link remains available.

Rules cannot understand every email. “No detected mismatch” is not a guarantee that every condition was recognized. Read the original before applying or relying on a deadline.

### Eligibility and relevance

- **Eligible:** recognized requirements match, or none were detected.
- **Ineligible:** a recognized requirement definitely fails.
- **Unknown:** profile data is missing or recognized unsupported conditions need review.

Ineligible opportunities are hidden by default, but retained so profile corrections can make them visible. Select **Show all opportunities** to inspect them. Assignments and other academic updates remain visible. Changing profile preferences refreshes scores on the next dashboard request.

Importance = eligibility points + category points:

| Component | Points |
| --- | --- |
| Eligibility: eligible / unknown / ineligible | 40 / 20 / 0 |
| Preferred category | 60 |
| Assignment or exam (even if not preferred) | 60 |
| Job, internship, scholarship, registration | 45 |
| Announcement / event / other | 30 / 25 / 15 |

Urgency is 100 for overdue, 95 within 24 hours, 80 within 3 days, 60 within 7 days, 40 within 14 days, 25 within 30 days, 12 beyond 30 days and 15 when no deadline is known.

`priority = round(0.6 * importance + 0.4 * urgency)`

Levels: critical >=80, high >=60, medium >=35, otherwise low. These are explicit application rules, not learned predictions.

### Persistence and access

Every task query contains the authenticated owner's ID. A request body/query cannot choose another owner. Task identity is unique per user + source + source ID. Classroom source IDs include course and record type to prevent collisions.

Re-sync updates extracted facts while preserving status. Overdue tasks remain visible. The urgent and upcoming sections exclude completed/dismissed tasks. A local completion status does not submit work to Classroom or modify Gmail.

The app stores hashed session tokens and encrypted Google access/refresh tokens. Session cookies are HttpOnly, SameSite=Lax and Secure in production. Profile edits cannot change email, Google identity or database operators. Mutation requests from untrusted browser origins are rejected.

For a personal/student-sized dataset, refreshing scores before filtering keeps pagination correct and avoids background infrastructure. It scans that user's stored tasks; this is not a claim of large-scale distributed processing. Imported records are not automatically deleted when the original is deleted; dismiss obsolete items.

## REST API

Except for health and OAuth setup, routes require a session created through Google sign-in.

| Method and path | Purpose |
| --- | --- |
| GET /api/health | Health check |
| GET /api/auth/google | Start Google sign-in |
| GET /api/auth/google/callback | Verify OAuth state and create a session |
| GET /api/auth/me | Current user |
| POST /api/auth/logout | Revoke session |
| GET/PATCH /api/users/:id | Read/edit own profile |
| POST /api/tasks/sync | Import and update Gmail/Classroom records |
| GET /api/tasks | Filter, sort and paginate own tasks |
| GET /api/tasks/priority/high | Open critical/high tasks |
| GET /api/tasks/deadlines/upcoming | Open tasks due in the next 14 days |
| GET /api/tasks/:taskId | Own task details |
| PATCH /api/tasks/:taskId/status | pending, in_progress, completed or dismissed |
| GET /api/gmail/messages | Own Gmail records |
| GET /api/gmail/messages/:messageId | Own Gmail message |
| GET /api/classroom/courses | Accessible active courses |
| GET /api/classroom/announcements?courseId=... | Published announcements |
| GET /api/classroom/coursework?courseId=... | Published coursework |
| GET /api/classroom/courses/:courseId/coursework/:courseWorkId | Coursework details |

Task list parameters: `status`, `category`, `priorityLevel`, `minPriority`, `page`, `limit` (1-100), `sortBy`, `sortOrder`, `includeIneligible=true|false`.

`sortBy` accepts `occurredAt` (default), `priorityScore`, `urgencyScore`, `importanceScore`, `deadline` and `createdAt`; `sortOrder` defaults to `desc`. The source-date fallback is computed before pagination, with a stable ID tie-breaker.

Sync accepts `includeGmail`, `includeClassroom`, `gmailQuery`, `gmailMaxResults` (1-100) and optional `classroomCourseIds` (up to 20). Errors for one source/course do not stop the other sources. The summary reports created/refreshed/ignored/failed counts and fetch errors.

## Verification

```powershell
npm --prefix backend test
npm --prefix backend run test:integration
npm --prefix frontend run lint
npm --prefix frontend run build
```

Integration tests start a separate temporary MongoDB instance and exercise the actual HTTP routes and database. Set `MONGOD_BINARY` to your installed executable if it is not on PATH (on Windows the test default is `C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe`). They do not connect to the database URI in your `.env`.

## Serve the built frontend

After `npm --prefix frontend run build`, Express can serve `frontend/dist` directly. Set `CLIENT_URL` to the backend's browser origin (for example `http://localhost:5000`) and run `npm --prefix backend start`. The production build uses the same origin for API calls unless `VITE_API_URL` was explicitly set at build time.

For a deployed real-account application, use HTTPS, `NODE_ENV=production`, matching client/redirect URLs and server-only secrets. This repository does not include a deployment or claim that one has been verified.
