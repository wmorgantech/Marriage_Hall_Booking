import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';

const db = vi.hoisted(() => ({
  areas: [] as any[], users: [] as any[], halls: [] as any[], created: [] as any[],
}));

vi.mock('../src/lib/prisma', () => {
  const tx = {
    area: { findFirst: async () => null, create: async () => ({}) },
    user: {
      findUnique: async ({ where }: any) => db.users.find((u) => u.phone === where.phone) ?? null,
      create: async ({ data }: any) => ({ id: `u-${data.phone}`, ...data }),
      update: async () => ({}),
    },
    hall: { create: async ({ data }: any) => { db.created.push(data); return data; } },
  };
  return {
    prisma: {
      area: { findMany: async () => db.areas },
      user: { findMany: async () => db.users },
      hall: { findMany: async () => db.halls },
      $transaction: async (fn: any) => fn(tx),
    },
  };
});

import { buildReport, buildTemplate, commitImport, normalizePhone, validateImport } from '../src/lib/bulkImport';

const HEADERS = ['City', 'Area', 'Hall Name', 'Address', 'Price Per Day (INR)', 'Seating Capacity', 'Dining Capacity',
  'Has Guest Rooms', 'Air Conditioned', 'Amenities', 'Hall Contact Number', 'Description', 'Latitude', 'Longitude',
  'Per Event Price (INR)', 'Advance Percent', 'Cancellation Policy', 'House Rules', 'Image URL', 'Owner Name', 'Owner Mobile', 'Owner Email'];

const good = {
  City: 'Salem', Area: 'Fairlands', 'Hall Name': 'Test Mahal', Address: '1 Main Rd', 'Price Per Day (INR)': 50000,
  'Seating Capacity': 200, 'Owner Name': 'Asha', 'Owner Mobile': '9000000001',
};

async function book(rows: Record<string, unknown>[], areaRows: string[][] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Halls');
  ws.addRow(HEADERS.map((h) => (h === 'City' || h === 'Owner Mobile' ? `${h} *` : h)));
  for (const r of rows) ws.addRow(HEADERS.map((h) => r[h] ?? ''));
  if (areaRows.length) {
    const a = wb.addWorksheet('Areas');
    a.addRow(['City *', 'Area *']);
    areaRows.forEach((r) => a.addRow(r));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeEach(() => { db.areas = []; db.users = []; db.halls = []; db.created = []; });

describe('normalizePhone', () => {
  it('accepts 10-digit, 91-prefixed and E.164 numbers; rejects junk', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('+14155550123')).toBe('+14155550123');
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('validateImport', () => {
  it('accepts the downloadable template (sample rows are valid)', async () => {
    const v = await validateImport(await buildTemplate());
    expect(v.summary.errors).toBe(0);
    expect(v.summary.valid).toBe(4); // 2 halls + 2 areas
    expect(v.summary.newOwners).toBe(2);
  });

  it('accepts a valid row and defaults contact number to the owner mobile', async () => {
    const v = await validateImport(await book([good]));
    expect(v.summary).toMatchObject({ valid: 1, errors: 0, duplicates: 0, newOwners: 1, newAreas: 1 });
    expect(v.halls[0].data.contactNumber).toBe('+919000000001');
  });

  it('reports row numbers and every missing / invalid field', async () => {
    const v = await validateImport(await book([
      { ...good, 'Hall Name': '', Address: '', 'Price Per Day (INR)': 'abc', 'Seating Capacity': 0, 'Owner Mobile': '123', 'Owner Email': 'bad' },
    ]));
    const r = v.results[0];
    expect(r.row).toBe(2);
    expect(r.status).toBe('error');
    const m = r.messages.join('|');
    expect(m).toMatch(/Hall Name/); expect(m).toMatch(/Address/); expect(m).toMatch(/Price Per Day/);
    expect(m).toMatch(/Seating Capacity/); expect(m).toMatch(/Owner Mobile/); expect(m).toMatch(/Owner Email/);
    expect(v.halls).toHaveLength(0);
  });

  it('rejects out-of-range numbers and bad Yes/No values', async () => {
    const v = await validateImport(await book([
      { ...good, 'Price Per Day (INR)': 999999999999, 'Has Guest Rooms': 'maybe', 'Advance Percent': 150, Latitude: 200 },
    ]));
    const m = v.results[0].messages.join('|');
    expect(m).toMatch(/Price Per Day.*between/);
    expect(m).toMatch(/Yes or No/);
    expect(m).toMatch(/Advance Percent/);
    expect(m).toMatch(/Latitude/);
  });

  it('flags duplicates inside the file and against existing halls', async () => {
    db.halls = [{ name: 'Old Mahal', city: 'Salem', area: 'Fairlands' }];
    const v = await validateImport(await book([
      good,
      { ...good, 'Hall Name': 'TEST MAHAL', City: 'salem' },
      { ...good, 'Hall Name': 'old mahal' },
    ]));
    expect(v.results.map((r) => r.status)).toEqual(['valid', 'duplicate', 'duplicate']);
    expect(v.halls).toHaveLength(1);
  });

  it('reuses existing cities/areas and existing owners instead of creating duplicates', async () => {
    db.areas = [{ city: 'Salem', name: 'Fairlands' }];
    db.users = [{ phone: '+919000000001', email: null, role: 'OWNER' }];
    const v = await validateImport(await book([{ ...good, City: 'SALEM', Area: 'fairlands' }]));
    expect(v.summary).toMatchObject({ valid: 1, newOwners: 0, newAreas: 0 });
    expect(v.halls[0].data.city).toBe('Salem');
  });

  it('refuses a mobile that belongs to a non-owner account, and an email held by someone else', async () => {
    db.users = [
      { phone: '+919000000001', email: null, role: 'USER' },
      { phone: '+919000000002', email: 'taken@x.com', role: 'OWNER' },
    ];
    const v = await validateImport(await book([
      good,
      { ...good, 'Hall Name': 'Another', 'Owner Mobile': '9000000003', 'Owner Email': 'taken@x.com' },
    ]));
    expect(v.results[0].messages.join()).toMatch(/not a hall owner/);
    expect(v.results[1].messages.join()).toMatch(/already belongs to another account/);
  });

  it('keeps one owner per mobile within the file and rejects conflicting emails', async () => {
    const v = await validateImport(await book([
      { ...good, 'Owner Email': 'a@x.com' },
      { ...good, 'Hall Name': 'Second Hall', 'Owner Email': 'b@x.com' },
      { ...good, 'Hall Name': 'Third Hall', 'Owner Email': 'a@x.com' },
    ]));
    expect(v.results.map((r) => r.status)).toEqual(['valid', 'error', 'valid']);
    expect(v.summary.newOwners).toBe(1);
  });

  it('rejects non-xlsx, empty and header-less files', async () => {
    await expect(validateImport(Buffer.from('hello'))).rejects.toThrow(/valid .xlsx/);
    await expect(validateImport(Buffer.alloc(0))).rejects.toThrow(/empty/);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Halls').addRow(['City']);
    await expect(validateImport(Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toThrow(/missing column/);
    await expect(validateImport(await book([]))).rejects.toThrow(/No data rows/);
  });
});

describe('commitImport', () => {
  it('saves only valid rows and never approves imported halls', async () => {
    const r = await commitImport(await book([good, { ...good, 'Hall Name': '' }]), { id: 'sa1' });
    expect(db.created).toHaveLength(1);
    expect(db.created[0]).toMatchObject({ name: 'Test Mahal', isApproved: false, ownerId: 'u-+919000000001' });
    expect(r.summary).toMatchObject({ hallsCreated: 1, ownersCreated: 1, failed: 1 });
    expect(r.results.map((x) => x.saved)).toEqual([true, false]);
  });
});

describe('buildReport', () => {
  it('produces an xlsx with one line per row and neutralises formula injection', async () => {
    const buf = await buildReport([
      { sheet: 'Halls', row: 2, label: '=cmd()', city: 'X', area: 'Y', ownerPhone: '', status: 'error', messages: ['bad'] },
    ]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet('Import report')!;
    expect(ws.rowCount).toBe(2);
    expect(String(ws.getRow(2).getCell(3).value)).toBe("'=cmd()");
    expect(ws.getRow(2).getCell(7).value).toBe('Failed');
  });
});
