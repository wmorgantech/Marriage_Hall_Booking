import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env.development / .env.production based on NODE_ENV,
// falling back to .env.
const envFile = `.env.${process.env.NODE_ENV === 'production' ? 'production' : 'development'}`;
const envPath = path.resolve(__dirname, '..', envFile);

dotenv.config({
  path: fs.existsSync(envPath)
    ? envPath
    : path.resolve(__dirname, '..', '.env'),
});

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
import muhurthamRoutes from './routes/muhurtham.routes';
import importRoutes from './routes/import.routes';
import areasRoutes, { adminAreas } from './routes/areas.routes';
import bookingRoutes from './routes/booking.routes';

const isProduction = process.env.NODE_ENV === 'production';

// Production environment validation.
if (
  isProduction &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
) {
  throw new Error(
    'JWT_SECRET must be set to a random string of at least 32 characters in production.'
  );
}

if (isProduction && !process.env.CORS_ORIGIN) {
  throw new Error(
    'CORS_ORIGIN must be set explicitly in production (no wildcard).'
  );
}

// WhatsApp OTP configuration validation.
if (isProduction) {
  const requiredWhatsAppEnv = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_GRAPH_VERSION',
  ];

  const missingWhatsAppEnv = requiredWhatsAppEnv.filter(
    (key) => !process.env[key]?.trim()
  );

  if (missingWhatsAppEnv.length > 0) {
    throw new Error(
      `Missing required WhatsApp OTP configuration: ${missingWhatsAppEnv.join(', ')}`
    );
  }
}

const app = express();

// Trust the reverse proxy (Nginx/IIS) for correct client IPs.
app.set('trust proxy', 1);

app.use(helmet());

const DEV_CORS_ORIGINS: (string | RegExp)[] = [
  'http://localhost:5173',
  'http://localhost:8081',
  /^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/,
];

app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ??
      DEV_CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['X-Total-Count'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

// General API rate limit.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Auth limiter for login, admin login, registration and OTP verification.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many attempts. Please try again later.',
  },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/admin-login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/otp/verify', authLimiter);

// Separate OTP request limiter to prevent excessive WhatsApp messages.
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many OTP requests. Please try again later.',
  },
});

app.use('/api/auth/otp/request', otpRequestLimiter);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/halls', hallRoutes);
app.use('/api', availabilityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', settingsRoutes);
app.use('/api', muhurthamRoutes);
app.use('/api', areasRoutes);
app.use('/api/admin/areas', adminAreas);
app.use('/api/admin/import', importRoutes);
app.use('/api/bookings', bookingRoutes);

// 404 handler.
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    err: any,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(err);

    if (err?.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.errors,
      });
    }

    if (err?.code === 'P2002') {
      return res.status(409).json({
        error: 'That record already exists',
      });
    }

    if (err?.code === 'P2025') {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    if (err?.code === 'P2003') {
      return res.status(409).json({
        error: 'A related record no longer exists',
      });
    }

    if (err?.code === 'P2020') {
      return res.status(400).json({
        error: 'A number is outside the allowed range',
      });
    }

    const status = err?.status ?? 500;

    res.status(status).json({
      error:
        status >= 500
          ? 'Internal server error'
          : err?.message ?? 'Request failed',
    });
  }
);

const port = Number(process.env.PORT ?? 4000);
const host =
  process.env.HOST ?? (isProduction ? '127.0.0.1' : '0.0.0.0');

app.listen(port, host, () => {
  console.log(`CheckNBook API listening on http://${host}:${port}`);
});
