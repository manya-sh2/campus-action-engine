const mongoose = require('mongoose');
const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');

async function start() {
  try {
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY'].filter((key) => !env[key]);
    if (missing.length) throw new Error('Set ' + missing.join(', ') + ' in backend/.env. Follow GOOGLE_SETUP.md to connect your real Google account.');
    if (!/^[a-f\d]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY)) throw new Error('TOKEN_ENCRYPTION_KEY must contain 64 hexadecimal characters.');
    await connectDB();
    const host = env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
    const server = app.listen(env.PORT, host, () => {
      console.log('[server] Listening on ' + host + ':' + env.PORT + ' (Gmail and Google Classroom APIs)');
    });
    const shutdown = () => server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error('[server]', error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  }
}
start();
