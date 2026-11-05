import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { auth } from '../middleware/auth';
import { requestOtp, verifyOtp } from '../lib/otp';
import { checkBruteForce, recordAttempt, pruneOldAttempts } from '../lib/loginGuard';

const router = Router();

function tokenPair(payload: { sub: string; role: 'USER' | 'OWNER' | 'ADMIN' | 'SUPERADMIN' }) {
  return { token: signToken(payload), refreshToken: signRefreshToken(payload) };
}

// Prune stale login attempts periodically (best-effort, non-blocking).
setInterval(() => { pruneOldAttempts().catch(() => {}); }, 60 * 60 * 1000);

const registerSchema = z.object({
  name: z.string().min(2, 'Owner name is required'),
  phone: z.string().regex(/^\+\d{10,15}$/, 'Use E.164 format, e.g. +919876543210'),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  hallName: z.string().min(2, 'Hall name is required').max(120),
});

router.post('/register', async (req, res, next) => {
  try {
    const { name, phone, email, password, hallName } = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return res.status(409).json({ error: 'This phone number is already registered. Please sign in instead.' });
    if (email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) return res.status(409).json({ error: 'This email is already registered. Please sign in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        passwordHash,
        role: 'OWNER',
        halls: {
          create: {
            name: hallName.trim(),
            city: '',
            area: '',
            address: '',
            price: 0,
            capacity: 0,
            contactNumber: phone,
            isApproved: false,
          },
        },
      },
    });
    const tokens = tokenPair({ sub: user.id, role: user.role });
    res.status(201).json({
      ...tokens,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    });
  } catch (e) { next(e); }
});

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
});

router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = loginSchema.parse(req.body);
    await checkBruteForce(phone);

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      await recordAttempt(phone, false, req.ip ?? undefined);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await recordAttempt(phone, false, req.ip ?? undefined);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.role !== 'OWNER') {
      return res.status(403).json({ error: 'This account cannot sign in here. Operators use the admin console.' });
    }

    await recordAttempt(phone, true, req.ip ?? undefined);
    const tokens = tokenPair({ sub: user.id, role: user.role });
    res.json({
      ...tokens,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    });
  } catch (e) { next(e); }
});

// ------------- OTP login (mobile-only signup for guests) -------------

const otpRequestSchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/, 'Use E.164 format, e.g. +919876543210'),
});

router.post('/otp/request', async (req, res, next) => {
  try {
    const { phone } = otpRequestSchema.parse(req.body);
    await requestOtp(phone);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

const otpVerifySchema = z.object({
  phone: z.string().regex(/^\+\d{10,15}$/, 'Use E.164 format, e.g. +919876543210'),
  name: z.string().min(2).max(80).optional(),
  otp: z.string().length(4),
});

router.post('/otp/verify', async (req, res, next) => {
  try {
    const { phone, name, otp } = otpVerifySchema.parse(req.body);
    if (!(await verifyOtp(phone, otp))) return res.status(401).json({ error: 'Invalid or expired OTP.' });

    let user = await prisma.user.findUnique({ where: { phone } });
    if (user && user.role !== 'USER') {
      return res
        .status(403)
        .json({ error: 'This number belongs to an owner/admin account. Please use password login.' });
    }
    if (!user) {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
      user = await prisma.user.create({
        data: {
          name: name?.trim() || `Guest ${phone.slice(-4)}`,
          phone,
          passwordHash,
          role: 'USER',
        },
      });
    }
    const tokens = tokenPair({ sub: user.id, role: user.role });
    res.json({
      ...tokens,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    });
  } catch (e) { next(e); }
});

// ------------- OTP-based owner registration (no password) -------------

const registerOtpSchema = z.object({
  name: z.string().min(2, 'Owner name is required'),
  phone: z.string().regex(/^\+\d{10,15}$/, 'Use E.164 format, e.g. +919876543210'),
  email: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  otp: z.string().length(4),
  hallName: z.string().min(2, 'Hall name is required').max(120),
});

router.post('/register-otp', async (req, res, next) => {
  try {
    const { name, phone, email, otp, hallName } = registerOtpSchema.parse(req.body);
    if (!(await verifyOtp(phone, otp))) return res.status(401).json({ error: 'Invalid or expired OTP.' });

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return res.status(409).json({ error: 'This phone number is already registered. Please sign in instead.' });
    if (email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) return res.status(409).json({ error: 'This email is already registered. Please sign in instead.' });
    }

    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        passwordHash,
        role: 'OWNER',
        halls: {
          create: {
            name: hallName.trim(),
            city: '',
            area: '',
            address: '',
            price: 0,
            capacity: 0,
            contactNumber: phone,
            isApproved: false,
          },
        },
      },
    });
    const tokens = tokenPair({ sub: user.id, role: user.role });
    res.status(201).json({
      ...tokens,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    });
  } catch (e) { next(e); }
});

// ------------- Admin email-based login (operator console) -------------

const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

router.post('/admin-login', async (req, res, next) => {
  try {
    const { email, password } = adminLoginSchema.parse(req.body);
    await checkBruteForce(email);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await recordAttempt(email, false, req.ip ?? undefined);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      return res.status(403).json({ error: 'This console is restricted to administrators.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await recordAttempt(email, false, req.ip ?? undefined);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await recordAttempt(email, true, req.ip ?? undefined);
    const tokens = tokenPair({ sub: user.id, role: user.role });
    res.json({
      ...tokens,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    });
  } catch (e) { next(e); }
});

// ------------- Token refresh -------------

router.post('/refresh', async (req, res, _next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true },
    });
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    const tokens = tokenPair({ sub: user.id, role: user.role });
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
    });
    res.json(user);
  } catch (e) { next(e); }
});

export default router;
