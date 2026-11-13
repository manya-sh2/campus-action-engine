require('dotenv').config();

const env = {
  PORT: Number(process.env.PORT || 5000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus-action-engine',
  // Trailing slashes are removed so CORS and redirect URLs always match exactly.
  CLIENT_URL: (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback',
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || 'cae_session',
  SESSION_TTL_DAYS: Number(process.env.SESSION_TTL_DAYS || 7),
};
if (!Number.isFinite(env.SESSION_TTL_DAYS) || env.SESSION_TTL_DAYS <= 0) {
  throw new Error('SESSION_TTL_DAYS must be positive.');
}
module.exports = env;
