# Campus Action Engine frontend

React and JavaScript dashboard for the Express REST API.

```powershell
npm ci
npm run dev
```

The development UI runs on http://localhost:3000 and calls http://localhost:5000 by default. Optional `VITE_API_URL` overrides that API origin. Cookies are included automatically; no tokens are stored in localStorage.

Screens: Google sign-in, task dashboard and profile settings. All decisions come from the backend. Refresh the dashboard to refresh deadline priorities.

`npm run build` creates a frontend build in `dist`. Without a configured `VITE_API_URL`, it calls the same origin that serves the build. Express can serve this build directly.

See the root [README](../README.md) for database setup, Google setup, limitations and tests.
