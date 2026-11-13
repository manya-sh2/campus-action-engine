# Understand your Campus Action Engine

This guide explains the revised project within the three Campus Action Engine bullets in your resume.

## A simple explanation you can build on

“Campus Action Engine collects academic information from Gmail and Google Classroom. The Node.js backend converts those records into a common format and uses JavaScript rules to identify categories, deadlines and eligibility conditions. It compares conditions with a student's profile and calculates priority from relevance and urgency. Tasks are stored in MongoDB under that student, and a React dashboard uses REST APIs to display and manage them.”

Read the code and run the examples before presenting this as something you understand. The guide describes what the implementation does; it does not certify interview readiness.

## The five ideas to learn first

1. **React renders the interface.** A component is a function that returns what to show. State stores things such as the selected category, loaded tasks and loading status.
2. **A REST API connects the interface to the server.** For example, the dashboard makes `GET /api/tasks`. Express receives that request and returns JSON.
3. **MongoDB persists information.** A task remains after the page closes because it is a database document, not just React state.
4. **Google OAuth grants account access.** Google asks the user for permission and gives the backend tokens. The app never receives the Google password. The app then creates its own session for future requests.
5. **Rules turn information into a prioritized list.** These are ordinary comparisons and arithmetic. There is no language model or AI agent.

## Follow one task from beginning to end

Example message:

```text
Subject: Software internship application
Apply now.
Eligible branches: Mining, CSE
Minimum CGPA: 8
Graduation year: 2027
Deadline: 2027-12-20
```

1. You click **Sync Gmail & Classroom**.
2. `SyncPanel.jsx` calls the sync endpoint through `api/endpoints.js`.
3. `auth.middleware.js` reads the cookie, verifies its session and places the authenticated user on `req.user`.
4. `sync.service.js` calls the user's Google API adapters.
5. `normalizer.js` gives Gmail and Classroom records the same shape.
6. `extractor.js` identifies “internship”, the explicitly labelled eligibility conditions and the deadline.
7. `eligibility.service.js` compares the conditions with the profile.
8. `importance.service.js` assigns eligibility and category points. `urgency.service.js` assigns deadline points.
9. `priority.service.js` calculates the weighted score and explains it.
10. `task.service.js` inserts or updates the task with the authenticated user's ID.
11. The React dashboard requests the updated list through REST.

For a matching profile that prefers internships, importance is 40 + 60 = 100. If the deadline is within 24 hours, urgency is 95. Priority is round(100 × 0.6 + 95 × 0.4) = 98, which is critical.

## Where to read, in order

| File | What to understand |
| --- | --- |
| frontend/src/App.jsx | Which screen is displayed |
| frontend/src/components/SyncPanel.jsx | What clicking Sync does |
| frontend/src/api/endpoints.js | How UI actions become HTTP requests |
| backend/src/app.js | How Express attaches routes and middleware |
| backend/src/routes/task.routes.js | Which URLs call which controllers |
| backend/src/controllers/task.controller.js | Validating input and calling services |
| backend/src/services/sync.service.js | The overall import workflow |
| backend/src/services/ingestion/normalizer.js | A common representation for two sources |
| backend/src/services/ingestion/extractor.js | Simple text rules and their limits |
| backend/src/services/decision/ | Eligibility, relevance, urgency and priority |
| backend/src/models/Task.js | The data stored for a task |
| backend/src/services/task.service.js | Database reads, updates and owner filters |
| backend/src/middlewares/auth.middleware.js | Establishing who made a request |
| backend/src/services/auth.service.js | Sessions and Google identity |
| backend/src/services/google/oauth.service.js | Google permission and token refresh |

## Questions you should be able to answer

**Why React?** It makes the dashboard a collection of reusable components. State and hooks coordinate filters, loading, errors and refreshed task data.

**Why Express?** It provides HTTP routing and middleware. Authentication runs before protected controllers; controllers call services; a final middleware returns consistent errors.

**Why MongoDB?** Academic tasks share core fields but have optional details such as course ID, deadline and eligibility. Mongoose describes the expected document shape and validates updates.

**What does “user-scoped” mean?** Every task read/update includes the ID from the verified session. User B requesting User A's task gets 404. An ID in the body cannot choose the owner.

**What is authentication versus authorization?** Authentication verifies who is signed in. Authorization checks which data that user can access. The session performs the first; owner-filtered queries perform the second.

**Why keep OAuth tokens separate from the user profile?** Tokens are credentials. They are encrypted, excluded from normal queries and stripped from JSON serialization. Profile data can be shown without returning credentials.

**Why not use JWT here?** The project uses an ordinary server-side session stored in MongoDB. Your resume's internship mentions JWT; the Campus Action Engine bullets only require secure user-scoped access. This project's session implementation satisfies that requirement and supports logout by deleting the session.

**Can anyone in the world sign in?** Authentication is real Google OAuth, but Google gates access. Gmail read permission is a restricted scope, so until Google verifies the app only listed test users (up to 100) can sign in, and Testing-mode refresh tokens expire after about 7 days. Say this plainly; it is a platform rule, not a code limitation.

**What happens if Google sign-in fails?** The callback catches the error, issues no session, and redirects to the login screen with a message. Unexpected internal errors are logged on the server and shown to the user only as a generic message.

**Why does Gmail import fetch in batches of 10?** Fetching 50-100 full messages at once can exceed Gmail's per-user rate limit and return 429 errors. Batching keeps results in order and stays under the limit.

**How do you avoid duplicates?** A unique compound index on user, source and source ID prevents repeated records. Classroom IDs include course and item type. An atomic upsert handles repeated or concurrent imports.

**What happens when a deadline changes?** Re-sync updates source facts but preserves the user's status. Dashboard reads recalculate scores before filtering and sorting.

**What happens if the profile is incomplete?** Eligibility is unknown, not confirmed. The opportunity remains visible with a review label. Recognized definitive mismatches can be filtered out.

**How do deadlines stay current without a scheduler?** The server recalculates when the dashboard is requested. The page has a Refresh button. A page left open does not receive live push updates.

**Is every email understood?** No. This is a rule-based parser with documented formats. It can miss unusual wording. The UI shows source excerpts and original links, and flags recognized ambiguity. No attachment understanding or human-level language comprehension is claimed.

**What did you test?** Parsing rules, time handling, priorities, validation, Google adapter behavior with simulated responses, and REST flows against a temporary real MongoDB database. Google responses are substituted only inside automated tests. Real OAuth/import requires your own configured Google account and separate verification.

## A practice session

1. Configure Google using GOOGLE_SETUP.md, sign in and sync your real records. Explain the tasks you see.
2. Open an imported task and work through the priority arithmetic.
3. Check a real opportunity against your actual profile and explain the eligibility result.
4. Select **Show all opportunities** and inspect any ineligible items.
5. Mark a task complete. Re-sync. Check that the status stays complete.
6. Open the source files for those actions and follow route -> controller -> service -> model.
7. Run the tests and read one authorization test and one date-parsing test.

## Boundaries to state honestly

The implemented project uses React, JavaScript, Node.js, Express, MongoDB and Google REST API integrations.
