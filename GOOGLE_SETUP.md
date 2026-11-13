# Connect your real Gmail and Google Classroom

The application has no demo profile or sample-data mode. It needs your Google Cloud OAuth client before it can sign you in.

## 1. Select a Google Cloud project

Open [Google Cloud Console](https://console.cloud.google.com/), sign in, and use the project selector at the top. Select your existing Campus Action Engine project, or choose **New project** and name it **Campus Action Engine**.

## 2. Enable the two APIs

In **APIs & Services → Library**, find and enable **Gmail API** and **Google Classroom API** in that project.

## 3. Configure consent

Open **Google Auth platform → Branding** and choose **Get started** if prompted. Use Campus Action Engine as the app name and your own support/contact email. Choose the audience appropriate to your account; for a personal Google account, choose External. Keep the app in Testing for your own development, and add the Google account you will sign in with under **Audience → Test users**. Google's [consent setup guide](https://developers.google.com/workspace/guides/configure-oauth-consent) explains these screens.

Under **Data Access → Add or remove scopes**, include the identity scopes and the read-only scopes used by this app:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.announcements.readonly
https://www.googleapis.com/auth/classroom.coursework.me.readonly
```

The code uses Google's `email` and `profile` aliases for the two userinfo scopes. It does not request Drive access or permission to send email or submit assignments.

## 4. Create the OAuth client

Open **Google Auth platform → Clients → Create client**. Select **Web application**, and name it **Campus Action Engine local**. Add this exact **Authorized redirect URI**:

```text
http://localhost:5000/api/auth/google/callback
```

Create the client. Google's [credentials guide](https://developers.google.com/workspace/guides/create-credentials) describes the client and redirect settings. This application exchanges the authorization code on the Node.js server, so its client configuration stays on the backend.

## 5. Put the credentials in VS Code

Open `backend/.env` and fill in your client ID and client secret locally:

```text
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
CLIENT_URL=http://localhost:3000
```

Do not paste the secret into chat or frontend files. `.env` is Git-ignored. Keep the existing `TOKEN_ENCRYPTION_KEY`; a key has already been generated in the prepared local copy. When setting up a fresh copy, generate a new key with:

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste that output into `TOKEN_ENCRYPTION_KEY` only in your local `.env`.

## Who can sign in? (read before sharing the link)

Sign-in is real Google OAuth: any Google account can authenticate once Google allows it for your project. Google, not this code, controls who is allowed. The app requests Gmail read access (`gmail.readonly`), which Google classifies as a **restricted scope**, so:

| Your Google Cloud project status | Who can sign in | Limits |
| --- | --- | --- |
| **Testing** (default) | Only accounts you add under **Audience → Test users** (up to 100) | Google expires the stored refresh token after about 7 days, so those users must sign in again weekly. Sync then reports that Google access expired. |
| **In production, not verified** | Anyone, but Google shows an "unverified app" warning | Capped at 100 users in total. This count cannot be reset. |
| **In production, verified** | Anyone, no warning | Requires Google's app verification plus an annual third-party security assessment for restricted scopes. Allow weeks. |

Practical guidance: for a portfolio, demo or interview, keep the project in Testing and add the people who will use it (yourself, friends, an interviewer who asks) as test users. Do not describe the project as publicly launched unless Google has verified it. If your college accounts are Google Workspace accounts and an administrator creates the project in that organisation with audience **Internal**, anyone in that organisation can sign in without verification.

Reference: [Google's OAuth app verification guide](https://support.google.com/cloud/answer/13463073).

## 6. Run and verify

Start MongoDB, the backend and frontend using the VS Code terminal commands in README.md. If old processes are running, stop them with Ctrl+C and restart them so they load the new code/configuration.

1. Open http://localhost:3000 and click **Sign in with Google**.
2. Choose the account added as a test user and review Google's requested read-only permissions.
3. Complete your real academic profile, then click **Sync Gmail & Classroom**.
4. Compare imported titles/deadlines with the original Gmail messages and Classroom assignments.
5. Check the sync error details if either source fails. An account with no Classroom courses will have no Classroom tasks.

`redirect_uri_mismatch` means the registered URI differs from the value above. A testing access error can mean the account is missing from Test users. A school-managed account can also be subject to its administrator's API/OAuth restrictions; those cannot be bypassed by the application.

Tests substitute Google responses inside test files only. A passing test suite is not evidence that your real account has been connected. Live verification is complete only after the sign-in and source comparison above succeed.
