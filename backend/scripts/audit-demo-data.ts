// READ-ONLY pre-deploy gate: does this database still contain demo/seed data or guessable logins?
//
//   pnpm audit:demo-data                 → exits 1 if anything is found (use before pointing real users at a DB)
//   pnpm audit:demo-data -- --allow-demo → report only, always exits 0 (fine for local dev)
//
// It runs SELECTs only (never writes or deletes) and prints counts, never hashes or secrets.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const allowDemo = process.argv.includes('--allow-demo');
const WEAK_PASSWORDS = ['admin123', 'owner123', 'super123', 'password', 'password123', '123456', '12345678', 'admin', 'owner', 'changeme', 'Admin@123'];

async function main() {
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  const rows = async (sql: string) => (await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql))[0].n;

  const seedHalls = Number(await rows(`select count(*) n from "Hall" where id ~ '^[a-z]+-[0-9]{3}$'`));
  const demoPhones = Number(await rows(`select count(*) n from "Hall" where "contactNumber" ~ '^\\+9100000[0-9]{5}$'`));
  const demoOwners = Number(await rows(`select count(*) n from "User" where phone ~ '^\\+9198765000[0-9]{2}$'`));
  const legacyAdmin = Number(await rows(`select count(*) n from "User" where phone = '+910000000000' and email is null`));
  const blockedNoBooking = Number(await rows(
    `select count(*) n from "Availability" a where a.status='BOOKED' and not exists (select 1 from "Booking" b where b."hallId"=a."hallId" and b.date=a.date and b.status in ('PENDING','CONFIRMED'))`,
  ));

  const users = await prisma.user.findMany({ select: { role: true, phone: true, passwordHash: true } });
  const weak: string[] = [];
  for (const u of users) {
    for (const w of WEAK_PASSWORDS) {
      if (await bcrypt.compare(w, u.passwordHash)) { weak.push(`${u.role} ${u.phone}`); break; }
    }
  }

  console.log(`Database: ${db}`);
  console.log(`  seeded demo halls (ids like "chennai-001") : ${seedHalls}`);
  console.log(`  halls with demo phone numbers (+9100000…)   : ${demoPhones}`);
  console.log(`  demo owner accounts (+9198765000xx)         : ${demoOwners}`);
  console.log(`  legacy phone-only admin account             : ${legacyAdmin}`);
  console.log(`  accounts accepting a guessable password     : ${weak.length}${weak.length ? '  → ' + weak.join(', ') : ''}`);
  console.log(`  blocked dates with no booking behind them   : ${blockedNoBooking}  (info: owner-blocked and/or seeded)`);

  const problems = seedHalls + demoPhones + demoOwners + weak.length;
  if (problems === 0) {
    console.log('✔ No demo data or guessable logins found.');
  } else if (allowDemo) {
    console.log('ℹ Demo data present (allowed: --allow-demo).');
  } else {
    console.log('✘ NOT production-ready: this database contains demo data and/or guessable logins.');
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
