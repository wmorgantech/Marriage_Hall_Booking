// One-shot, idempotent: retire the guessable logins the old seed left behind (owner123 / admin123).
//
//   • demo owners (+919876500001 … +919876500005)  → password becomes SEED_OWNER_PASSWORD (min 12 chars)
//   • legacy phone-only admin (+910000000000)       → DISABLED: set to a random password nobody knows
//
// It never deletes anything and only touches those accounts' password hashes. It prints counts, never
// passwords. Run: pnpm rotate:demo-credentials   (refuses NODE_ENV=production unless ALLOW_SEED=true).
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_OWNER_PHONES = ['+919876500001', '+919876500002', '+919876500003', '+919876500004', '+919876500005'];
const LEGACY_ADMIN_PHONE = '+910000000000';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    throw new Error('Refusing to modify accounts in NODE_ENV=production. Set ALLOW_SEED=true only if you really mean it.');
  }
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  if (!ownerPassword || ownerPassword.length < 12) {
    throw new Error('Set SEED_OWNER_PASSWORD (min 12 characters) in backend/.env first.');
  }

  const owners = await prisma.user.updateMany({
    where: { phone: { in: DEMO_OWNER_PHONES }, role: 'OWNER' },
    data: { passwordHash: await bcrypt.hash(ownerPassword, 10) },
  });

  // `email: null` guarantees this can never disable a real operator account (those sign in by email).
  const legacyAdmin = await prisma.user.updateMany({
    where: { phone: LEGACY_ADMIN_PHONE, role: 'ADMIN', email: null },
    data: { passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10) },
  });

  console.log(`✔ demo owners re-keyed to SEED_OWNER_PASSWORD: ${owners.count} of ${DEMO_OWNER_PHONES.length}`);
  console.log(`✔ legacy phone-only admin disabled (random unknown password): ${legacyAdmin.count} of 1`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
