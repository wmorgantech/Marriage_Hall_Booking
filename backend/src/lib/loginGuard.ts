import { prisma } from './prisma';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

export async function checkBruteForce(target: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: { target, success: false, createdAt: { gte: since } },
  });
  if (failures >= MAX_FAILURES) {
    throw httpError(429, 'Too many failed attempts for this account. Please try again later.');
  }
}

export async function recordAttempt(target: string, success: boolean, ip?: string): Promise<void> {
  await prisma.loginAttempt.create({
    data: { target, success, ip },
  });
}

export async function pruneOldAttempts(): Promise<void> {
  const cutoff = new Date(Date.now() - WINDOW_MS * 4);
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
