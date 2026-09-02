import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { auth } from '../middleware/auth';
import { requestOtp, verifyOtp } from '../lib/otp';

const router = Router();

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
    const token = signToken({ sub: user.id, role: user.role });
    res.status(201).json({
      token,
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
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ sub: user.id, role: user.role });
    res.json({
      token,
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
    if (!(await verifyOtp(phone, otp))) return res.status(401).json({ error: 'Invalid OTP.' });

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
    const token = signToken({ sub: user.id, role: user.role });
    res.json({
      token,
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
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      return res.status(403).json({ error: 'This console is restricted to administrators.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ sub: user.id, role: user.role });
    res.json({
      token,
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    });
  } catch (e) { next(e); }
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
