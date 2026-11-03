// One-shot script to upsert the two operator-console accounts.
// Run via:  pnpm --filter @checknbook/api exec tsx scripts/seed-admins.ts
//
// Idempotent: re-running just refreshes the password hash.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Seed = {
  email: string;
  password: string;
  phone: string;
  name: string;
  role: 'ADMIN' | 'SUPERADMIN';
};

// Passwords always come from the environment (backend/.env) — there are no
// built-in defaults, so no environment can end up with a guessable operator login.
function required(name: 'SEED_ADMIN_PASSWORD' | 'SEED_SUPERADMIN_PASSWORD'): string {
  const v = process.env[name];
  if (!v || v.length < 12) {
    throw new Error(`Set ${name} (min 12 characters) in backend/.env before running this script.`);
  }
  return v;
}

async function main() {
  const ACCOUNTS: Seed[] = [
    {
      email: 'admin@checknbook.com',
      password: required('SEED_ADMIN_PASSWORD'),
      phone: '+910000000001',
      name: 'Platform Admin',
      role: 'ADMIN',
    },
    {
      email: 'superadmin@checknbook.com',
      password: required('SEED_SUPERADMIN_PASSWORD'),
      phone: '+910000000002',
      name: 'Super Admin',
      role: 'SUPERADMIN',
    },
  ];

  for (const a of ACCOUNTS) {
    const passwordHash = await bcrypt.hash(a.password, 10);
    const user = await prisma.user.upsert({
      where: { email: a.email },
      create: {
        email: a.email,
        phone: a.phone,
        name: a.name,
        role: a.role,
        passwordHash,
      },
      update: {
        passwordHash,
        role: a.role,
        name: a.name,
      },
    });
    console.log(`✔ ${a.role.padEnd(10)} ${a.email}  (id=${user.id})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
