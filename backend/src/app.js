const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const env = require('./config/env');
const userRoutes = require('./routes/user.routes');
const authRoutes = require('./routes/auth.routes');
const gmailRoutes = require('./routes/gmail.routes');
const classroomRoutes = require('./routes/classroom.routes');
const taskRoutes = require('./routes/task.routes');
const notFound = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/error.middleware');

const app = express();

// --- Core middleware ---
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true, // required so the session cookie is sent/received cross-origin
  })
);
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.disable('x-powered-by');
app.set('query parser', 'simple');

// Guard cookie-authenticated mutations against requests from other websites.
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      ((req.get('origin') && req.get('origin') !== new URL(env.CLIENT_URL).origin) ||
       req.get('sec-fetch-site') === 'cross-site')) {
    return res.status(403).json({ success: false, message: 'Request origin is not allowed.' });
  }
  next();
});

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Campus Action Engine API is running',
  });
});

// --- Feature routes ---
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/classroom', classroomRoutes);
app.use('/api/tasks', taskRoutes);

// A production build can be served by the same Express process.
app.use(express.static(path.resolve(__dirname, '../../frontend/dist')));

// --- 404 + centralized error handling (must stay last) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
