import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env.development / .env.production based on NODE_ENV, falling back to .env.
const envFile = `.env.${process.env.NODE_ENV === 'production' ? 'production' : 'development'}`;
const envPath = path.resolve(__dirname, '..', envFile);
dotenv.config({ path: fs.existsSync(envPath) ? envPath : path.resolve(__dirname, '..', '.env') });

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes';
import hallRoutes from './routes/hall.routes';
import availabilityRoutes from './routes/availability.routes';
import adminRoutes from './routes/admin.routes';
import settingsRoutes from './routes/settings.routes';
import areasRoutes, { adminAreas } from './routes/areas.routes';
import bookingRoutes from './routes/booking.routes';

const isProduction = process.env.NODE_ENV === 'production';

// Fail fast rather than silently signing tokens with a guessable secret.
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
}
if (isProduction && !process.env.CORS_ORIGIN) {
  throw new Error('CORS_ORIGIN must be set explicitly in production (no wildcard).');
}

const app = express();

// Trust the reverse proxy (Nginx/IIS) for correct client IPs in rate limiting & logs.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? '*',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

// General API rate limit — generous, just to blunt scraping/abuse.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Tighter limit on auth endpoints to slow down credential-stuffing / brute force.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/admin-login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/otp', authLimiter);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/halls', hallRoutes);
app.use('/api', availabilityRoutes); // exposes /api/halls/:id/availability via router
app.use('/api/admin', adminRoutes);
app.use('/api', settingsRoutes); // /api/settings (public GET) + /api/admin/settings (admin PATCH)
app.use('/api', areasRoutes);    // /api/areas (public GET)
app.use('/api/admin/areas', adminAreas);
app.use('/api/bookings', bookingRoutes);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' });
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => {
  console.log(`CheckNBook API listening on http://${host}:${port}`);
});
