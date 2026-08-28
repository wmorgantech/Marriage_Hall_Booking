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

const ACCOUNTS: Seed[] = [
  {
    email: 'admin@checknbook.com',
    password: 'admin123',
    phone: '+910000000001',
    name: 'Platform Admin',
    role: 'ADMIN',
  },
  {
    email: 'superadmin@checknbook.com',
    password: 'super123',
    phone: '+910000000002',
    name: 'Super Admin',
    role: 'SUPERADMIN',
  },
];

async function main() {
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
