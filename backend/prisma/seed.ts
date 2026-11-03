// Demo-data seed (LOCAL / STAGING ONLY).
//
//   pnpm seed                 → idempotent top-up: inserts anything missing, never deletes
//   SEED_RESET=true pnpm seed → ALSO wipes all halls + availability first (destructive)
//
// Demo owner login password comes from SEED_OWNER_PASSWORD (set it in backend/.env).
// Demo contact numbers use the unroutable +9100000xxxxx range so the Call/WhatsApp
// buttons can never reach a real person.
import 'dotenv/config';
import { PrismaClient, type AvailabilityStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Deterministic pseudo-random so re-runs produce the same dataset.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------- Tamil Nadu cities + areas --------
const TAMIL_NADU: Record<string, string[]> = {
  Chennai: [
    'T. Nagar', 'Mylapore', 'Adyar', 'Anna Nagar', 'Velachery', 'OMR', 'ECR',
    'Nungambakkam', 'Porur', 'Tambaram', 'Chromepet', 'Thiruvanmiyur', 'Besant Nagar',
    'Pallavaram', 'Guindy',
  ],
  Coimbatore: [
    'Gandhipuram', 'RS Puram', 'Peelamedu', 'Saibaba Colony', 'Singanallur',
    'Race Course', 'Saravanampatti', 'Ganapathy', 'Ukkadam', 'Podanur',
  ],
  Madurai: [
    'Anna Nagar', 'K.K. Nagar', 'Tallakulam', 'Simmakkal', 'Bypass Road',
    'Arapalayam', 'Goripalayam', 'Vilangudi', 'Thirunagar', 'Villapuram',
  ],
  Tiruchirappalli: [
    'Srirangam', 'Cantonment', 'Thillai Nagar', 'Woraiyur', 'Chatram',
    'Thiruverumbur', 'K.K. Nagar', 'BHEL Township', 'Crawford', 'Ariyamangalam',
  ],
  Salem: [
    'Fairlands', 'Hasthampatti', 'Shevapet', 'Alagapuram', 'Ammapet',
    'Suramangalam', 'Kitchipalayam', 'Yercaud Road', 'Four Roads', 'Gugai',
  ],
  Tirunelveli: [
    'Palayamkottai', 'Vannarpettai', 'Perumalpuram', 'Tirunelveli Town', 'Maharaja Nagar',
    'Pettai', 'Murugankurichi', 'Melapalayam', 'Tiruvelvelipuram', 'Kokkirakulam',
  ],
  Erode: [
    'Brough Road', 'R.K.V. Road', 'Sampath Nagar', 'Periyar Nagar', 'Surampatti',
    'Veerappanchatram', 'Suriyampalayam', 'Lakshmi Nagar', 'Bhavani Road', 'Thindal',
  ],
  Vellore: [
    'Sathuvachari', 'Katpadi', 'Bagayam', 'Gandhi Nagar', 'Thorapadi',
    'Arcot Road', 'Viruthampet', 'Konavattam', 'Thiruvalam', 'Ranipet Road',
  ],
  Thanjavur: [
    'Medical College Road', 'Railway Station Road', 'Ram Nagar', 'Pudukottai Road',
    'Vallam', 'Mariamman Kovil', 'South Main Street', 'Thillai Nagar', 'Puthur',
    'Ayyappan Nagar',
  ],
  Dindigul: [
    'Palani Road', 'Begumpur', 'Rock Fort Road', 'N.P.K.R.R. Nagar', 'Salaipudur',
    'Pallapatti', 'Rajiv Gandhi Nagar', 'Batlagundu Road', 'Kodai Road', 'Bangalapudur',
  ],
};

// First three digits of each city's real postal PIN range.
const PINCODE_PREFIX: Record<string, string> = {
  Chennai: '600', Coimbatore: '641', Madurai: '625', Tiruchirappalli: '620', Salem: '636',
  Tirunelveli: '627', Erode: '638', Vellore: '632', Thanjavur: '613', Dindigul: '624',
};

const NAME_PREFIXES = [
  'Sri', 'Sree', 'Shri', 'Suvarna', 'Raja', 'Rani', 'Lakshmi', 'Saraswathi', 'Meenakshi',
  'Kamakshi', 'Annapoorna', 'Murugan', 'Ganesh', 'Balaji', 'Venkatesha', 'Dakshina',
  'Royal', 'Heritage', 'Grand', 'Sapphire', 'Divine', 'Sacred', 'Sangam', 'Kongu',
  'Chola', 'Pandyan', 'Aura', 'Temple View', 'Marigold', 'Palace',
];
const NAME_SUFFIXES = [
  'Kalyana Mandapam', 'Thirumana Mandapam', 'Mahal', 'Kalyana Arangam', 'Convention Centre',
  'Grand Ballroom', 'Banquet Hall', 'Function Palace', 'Residency', 'Cultural Centre',
  'Garden', 'Heritage Hall', 'Palace', 'Hall', 'Gardens',
];

const HALL_IMAGES = [
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1530023367847-a683933f4172?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1478146059778-26028b07395a?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=75&auto=format&fit=crop',
  // (a dead URL, photo-1503002032858, and an unrelated business-handshake photo were removed from this list)
  'https://images.unsplash.com/photo-1509610973147-232dfea52a97?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507504031003-b417219a0fde?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1464047736614-af63643285bf?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200&q=75&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=1200&q=75&auto=format&fit=crop',
];

const DESCRIPTIONS = [
  'A premium venue offering traditional elegance with modern luxury — perfect for South Indian weddings.',
  'Spacious mandapam with ornate pillars, rich carvings and warm temple lighting.',
  'Centrally located with ample parking, dedicated kitchen area and dining hall.',
  'Heritage property known for its auspicious muhurtham dates and hospitality.',
  'Banquet hall with fully air-conditioned environment and in-house catering.',
  'Open-air pavilion surrounded by gardens — ideal for evening receptions.',
  'Family-run kalyana mandapam with five decades of hosting traditional weddings.',
  'Modern convention centre with state-of-the-art AV, stage lighting and valet parking.',
];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Valid E.164 shape but not a routable Indian mobile (those start +916..+919) —
// seeded halls must never ring a real person.
function formatPhone(rng: () => number): string {
  let n = '+9100000';
  for (let i = 0; i < 5; i++) n += Math.floor(rng() * 10);
  return n;
}

function pad(n: number, w = 3) {
  return String(n).padStart(w, '0');
}

type HallSeed = {
  id: string;
  name: string;
  city: string;
  area: string;
  address: string;
  price: number;
  capacity: number;
  hasRooms: boolean;
  hasAC: boolean;
  imageUrl: string;
  contactNumber: string;
  description: string;
  isApproved: boolean;
  ownerId: string;
};

async function main() {
  // Seeds ~1,000 fabricated demo halls. It must never run against a real database.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    throw new Error(
      'Refusing to run the demo seed against NODE_ENV=production. ' +
        'If you really intend to seed this database, set ALLOW_SEED=true explicitly.',
    );
  }
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  if (!ownerPassword) {
    throw new Error('Set SEED_OWNER_PASSWORD (e.g. in backend/.env) — the demo owners need a password.');
  }

  if (process.env.SEED_RESET === 'true') {
    console.log('SEED_RESET=true — wiping existing halls + availability…');
    await prisma.availability.deleteMany();
    await prisma.hall.deleteMany();
  } else {
    console.log('Top-up mode: existing data is kept (set SEED_RESET=true to wipe halls first).');
  }

  // -------- Users (a pool of 5 demo owners; operator accounts come from seed-admins.ts) --------
  const ownerPwd = await bcrypt.hash(ownerPassword, 10);

  const ownerSeeds = [
    { name: 'Ravi Kumar',    phone: '+919876500001' },
    { name: 'Lakshmi Devi',  phone: '+919876500002' },
    { name: 'Karthik Raja',  phone: '+919876500003' },
    { name: 'Priya Sundaram',phone: '+919876500004' },
    { name: 'Anand Iyer',    phone: '+919876500005' },
  ];
  const owners = [];
  for (const o of ownerSeeds) {
    const row = await prisma.user.upsert({
      where: { phone: o.phone },
      update: {},
      create: { ...o, passwordHash: ownerPwd, role: 'OWNER' },
    });
    owners.push(row);
  }

  const HALLS_PER_CITY = 100;
  const allHalls: HallSeed[] = [];
  const cityEntries = Object.entries(TAMIL_NADU);

  // Hall names are unique across the whole dataset (not just within a city).
  const usedNames = new Set<string>();

  cityEntries.forEach(([city, areas], cityIdx) => {
    const rng = mulberry32(1000 + cityIdx);

    for (let i = 1; i <= HALLS_PER_CITY; i++) {
      const area = pick(rng, areas);
      let name = `${pick(rng, NAME_PREFIXES)} ${pick(rng, NAME_SUFFIXES)}`;
      let attempts = 0;
      while (usedNames.has(name) && attempts < 30) {
        name = `${pick(rng, NAME_PREFIXES)} ${pick(rng, NAME_SUFFIXES)}`;
        attempts++;
      }
      // 450 prefix/suffix pairs < 1,000 halls, so fall back to a location qualifier.
      if (usedNames.has(name)) name = `${name} – ${area}`;
      if (usedNames.has(name)) name = `${name} ${pad(i, 2)}`;
      usedNames.add(name);

      const streetNo = 1 + Math.floor(rng() * 280);
      const pincode = `${PINCODE_PREFIX[city]}${String(Math.floor(rng() * 1000)).padStart(3, '0')}`;
      const address = `No. ${streetNo}, ${area}, ${city} - ${pincode}`;

      // Price buckets — 55k..480k in 5k steps
      const price = 55000 + Math.floor(rng() * 86) * 5000;

      // Capacity bands
      const capBands = [200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 1800, 2500];
      const capacity = pick(rng, capBands);

      const hasAC = rng() > 0.3;
      const hasRooms = rng() > 0.55;
      const imageUrl = HALL_IMAGES[Math.floor(rng() * HALL_IMAGES.length)];
      const description = pick(rng, DESCRIPTIONS);
      const contactNumber = formatPhone(rng);
      const owner = owners[(cityIdx * HALLS_PER_CITY + i) % owners.length];

      allHalls.push({
        id: `${city.toLowerCase().replace(/[^a-z]/g, '')}-${pad(i)}`,
        name,
        city,
        area,
        address,
        price,
        capacity,
        hasRooms,
        hasAC,
        imageUrl,
        contactNumber,
        description,
        isApproved: true,
        ownerId: owner.id,
      });
    }
  });

  console.log(`Seeding ${allHalls.length} halls across ${cityEntries.length} Tamil Nadu cities…`);

  // Chunked createMany to stay under parameter limits
  const CHUNK = 200;
  for (let i = 0; i < allHalls.length; i += CHUNK) {
    const slice = allHalls.slice(i, i + CHUNK);
    await prisma.hall.createMany({ data: slice, skipDuplicates: true });
  }

  // -------- Areas: keep the admin-managed Area table in step with the hall data --------
  const areaRows = cityEntries.flatMap(([city, areas]) => areas.map((name) => ({ city, name })));
  await prisma.area.createMany({ data: areaRows, skipDuplicates: true });

  // -------- Availability: upcoming BOOKED dates (next 120 days) for ~18% of halls --------
  console.log('Generating availability (booked) rows…');
  const availRows: { hallId: string; date: Date; status: AvailabilityStatus }[] = [];
  const now = new Date();
  const baseStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const windowDays = 120;
  const rng = mulberry32(4242);
  for (const h of allHalls) {
    if (rng() > 0.18) continue;
    const nBooked = 1 + Math.floor(rng() * 4);
    const taken = new Set<string>();
    for (let j = 0; j < nBooked; j++) {
      const offset = Math.floor(rng() * windowDays);
      const d = new Date(baseStart + offset * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      if (taken.has(key)) continue;
      taken.add(key);
      availRows.push({ hallId: h.id, date: d, status: 'BOOKED' });
    }
  }

  for (let i = 0; i < availRows.length; i += CHUNK) {
    const slice = availRows.slice(i, i + CHUNK);
    await prisma.availability.createMany({ data: slice, skipDuplicates: true });
  }

  console.log('Seed complete.');
  console.log(`   Owners → ${owners.map((o) => o.phone).join(', ')} (password: SEED_OWNER_PASSWORD)`);
  console.log(`   Halls  → ${allHalls.length} generated (${HALLS_PER_CITY} × ${cityEntries.length} TN cities); existing ids are skipped`);
  console.log(`   Areas  → ${areaRows.length} generated; Booked → ${availRows.length} upcoming availability rows generated`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
