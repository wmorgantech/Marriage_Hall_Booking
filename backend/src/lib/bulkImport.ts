import ExcelJS from 'exceljs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { missingHallFields } from './hall';
import { LIMITS } from './pricing';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 1000;

/** Columns of the "Halls" sheet — one row per hall, with its owner/manager on the same row. */
const HALL_COLUMNS = [
  { key: 'city', header: 'City', required: true, width: 18, note: 'Existing city names are reused (case-insensitive).' },
  { key: 'area', header: 'Area', required: true, width: 20, note: 'Locality inside the city. Created automatically if new.' },
  { key: 'name', header: 'Hall Name', required: true, width: 28, note: 'At least 2 characters.' },
  { key: 'address', header: 'Address', required: true, width: 40, note: 'Full street address.' },
  { key: 'price', header: 'Price Per Day (INR)', required: true, width: 20, note: `Whole rupees, 1 to ${LIMITS.price.toLocaleString('en-IN')}.` },
  { key: 'capacity', header: 'Seating Capacity', required: true, width: 18, note: `Whole number, 1 to ${LIMITS.headcount.toLocaleString('en-IN')}.` },
  { key: 'diningCapacity', header: 'Dining Capacity', required: false, width: 18, note: 'Whole number. Default 0.' },
  { key: 'hasRooms', header: 'Has Guest Rooms', required: false, width: 18, note: 'Yes or No. Default No.' },
  { key: 'hasAC', header: 'Air Conditioned', required: false, width: 18, note: 'Yes or No. Default No.' },
  { key: 'amenities', header: 'Amenities', required: false, width: 40, note: 'Comma-separated, e.g. Wifi, Valet Parking, Bridal Room (max 40 chars each).' },
  { key: 'contactNumber', header: 'Hall Contact Number', required: false, width: 20, note: 'Defaults to the owner mobile number when blank.' },
  { key: 'description', header: 'Description', required: false, width: 40, note: 'Free text.' },
  { key: 'latitude', header: 'Latitude', required: false, width: 12, note: '-90 to 90.' },
  { key: 'longitude', header: 'Longitude', required: false, width: 12, note: '-180 to 180.' },
  { key: 'perEventPrice', header: 'Per Event Price (INR)', required: false, width: 20, note: 'Whole rupees, informational.' },
  { key: 'advancePercent', header: 'Advance Percent', required: false, width: 16, note: '0 to 100. Default 50.' },
  { key: 'cancellationPolicy', header: 'Cancellation Policy', required: false, width: 36, note: 'Max 2000 characters.' },
  { key: 'houseRules', header: 'House Rules', required: false, width: 36, note: 'Max 2000 characters.' },
  { key: 'imageUrl', header: 'Image URL', required: false, width: 36, note: 'Full https:// link.' },
  { key: 'ownerName', header: 'Owner Name', required: true, width: 22, note: 'Owner / manager full name.' },
  { key: 'ownerPhone', header: 'Owner Mobile', required: true, width: 18, note: '10-digit Indian number or +country format. Identifies the owner account.' },
  { key: 'ownerEmail', header: 'Owner Email', required: false, width: 28, note: 'Must not belong to a different account.' },
] as const;

type HallKey = (typeof HALL_COLUMNS)[number]['key'];
type RawRow = Partial<Record<HallKey, string>>;

export type ImportStatus = 'valid' | 'duplicate' | 'error';
export type ImportRowResult = {
  sheet: 'Areas' | 'Halls';
  row: number;
  label: string;
  city: string;
  area: string;
  ownerPhone: string;
  status: ImportStatus;
  messages: string[];
  /** Filled by commitImport: true when the row was written. */
  saved?: boolean;
};

type ParsedHall = {
  city: string; area: string; name: string; address: string; price: number; capacity: number;
  diningCapacity: number; hasRooms: boolean; hasAC: boolean; amenities: string[]; contactNumber: string;
  description: string | null; latitude: number | null; longitude: number | null; perEventPrice: number | null;
  advancePercent: number; cancellationPolicy: string | null; houseRules: string | null; imageUrl: string | null;
  ownerName: string; ownerPhone: string; ownerEmail: string | null;
};

export type ValidationOutput = {
  results: ImportRowResult[];
  halls: { row: number; data: ParsedHall }[];
  areas: { row: number; city: string; name: string }[];
  summary: { total: number; valid: number; duplicates: number; errors: number; newOwners: number; newAreas: number };
};

export class ImportFileError extends Error {
  status = 400;
}

/* ----------------------------- helpers ----------------------------- */

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString();
    const o = v as any;
    if (o.richText) return o.richText.map((t: any) => t.text).join('').trim();
    if (o.text != null) return String(o.text).trim(); // hyperlink
    if (o.result != null) return String(o.result).trim(); // formula
    return '';
  }
  return String(v).trim();
}

const ci = (s: string) => s.trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseInt0(text: string, label: string, max: number, errors: string[], opts: { required?: boolean; min?: number } = {}): number | null {
  if (!text) {
    if (opts.required) errors.push(`${label} is required`);
    return null;
  }
  const n = Number(text.replace(/,/g, ''));
  if (!Number.isInteger(n)) { errors.push(`${label} must be a whole number`); return null; }
  const min = opts.min ?? 0;
  if (n < min || n > max) { errors.push(`${label} must be between ${min} and ${max}`); return null; }
  return n;
}

function parseBool(text: string, label: string, errors: string[]): boolean {
  if (!text) return false;
  const t = ci(text);
  if (['yes', 'y', 'true', '1'].includes(t)) return true;
  if (['no', 'n', 'false', '0'].includes(t)) return false;
  errors.push(`${label} must be Yes or No`);
  return false;
}

/* ----------------------------- workbook reading ----------------------------- */

async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  if (buf.length === 0) throw new ImportFileError('The uploaded file is empty');
  if (buf.length > MAX_FILE_BYTES) throw new ImportFileError('File is too large (max 5 MB)');
  // .xlsx is a zip archive: must start with "PK"
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new ImportFileError('Not a valid .xlsx file');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as any);
  } catch {
    throw new ImportFileError('Could not read the file. Please upload the .xlsx template.');
  }
  return wb;
}

function readSheet<K extends string>(ws: ExcelJS.Worksheet, columns: readonly { key: K; header: string }[]) {
  const headerIdx = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    headerIdx.set(ci(cellText(cell.value).replace(/\*$/, '')), col);
  });
  const missing = columns.filter((c) => !headerIdx.has(ci(c.header)));
  if (missing.length) {
    throw new ImportFileError(`Sheet "${ws.name}" is missing column(s): ${missing.map((m) => m.header).join(', ')}. Please use the downloaded template.`);
  }
  const rows: { row: number; values: Partial<Record<K, string>> }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const values: Partial<Record<K, string>> = {};
    let any = false;
    for (const c of columns) {
      const t = cellText(ws.getRow(r).getCell(headerIdx.get(ci(c.header))!).value);
      values[c.key] = t;
      if (t) any = true;
    }
    if (any) rows.push({ row: r, values });
  }
  return rows;
}

/* ----------------------------- validation ----------------------------- */

export async function validateImport(buf: Buffer): Promise<ValidationOutput> {
  const wb = await loadWorkbook(buf);
  const hallsWs = wb.getWorksheet('Halls');
  if (!hallsWs) throw new ImportFileError('The workbook has no "Halls" sheet. Please use the downloaded template.');
  const hallRows = readSheet(hallsWs, HALL_COLUMNS);
  const areaCols = [{ key: 'city', header: 'City' }, { key: 'area', header: 'Area' }] as const;
  const areasWs = wb.getWorksheet('Areas');
  const areaRows = areasWs ? readSheet(areasWs, areaCols) : [];

  if (hallRows.length + areaRows.length === 0) throw new ImportFileError('No data rows found. Fill in the template and upload it again.');
  if (hallRows.length + areaRows.length > MAX_ROWS) throw new ImportFileError(`Too many rows (max ${MAX_ROWS} per import)`);

  // Existing data used for reuse / duplicate detection
  const phones = hallRows.map((r) => normalizePhone(r.values.ownerPhone ?? '')).filter((p): p is string => !!p);
  const emails = hallRows.map((r) => ci(r.values.ownerEmail ?? '')).filter(Boolean);
  const [existingAreas, existingUsers, existingHalls] = await Promise.all([
    prisma.area.findMany({ select: { city: true, name: true } }),
    prisma.user.findMany({
      where: { OR: [{ phone: { in: phones } }, ...(emails.length ? [{ email: { in: emails, mode: 'insensitive' as const } }] : [])] },
      select: { phone: true, email: true, role: true },
    }),
    prisma.hall.findMany({ select: { name: true, city: true, area: true } }),
  ]);

  // canonical city / area casing (existing DB first, then first occurrence in the file)
  const cityCanon = new Map<string, string>();
  const areaKnown = new Set<string>();
  for (const a of existingAreas) { cityCanon.set(ci(a.city), a.city); areaKnown.add(`${ci(a.city)}|${ci(a.name)}`); }
  const hallKnown = new Set(existingHalls.map((h) => `${ci(h.name)}|${ci(h.city)}|${ci(h.area)}`));
  const userByPhone = new Map(existingUsers.map((u) => [u.phone, u]));
  const userByEmail = new Map(existingUsers.filter((u) => u.email).map((u) => [ci(u.email!), u]));

  const results: ImportRowResult[] = [];
  const halls: ValidationOutput['halls'] = [];
  const areas: ValidationOutput['areas'] = [];
  const newAreaKeys = new Set<string>();
  const fileOwners = new Map<string, { name: string; email: string | null; row: number }>();
  const seenHalls = new Set<string>();
  const newOwnerPhones = new Set<string>();

  const canonCity = (city: string) => {
    const k = ci(city);
    if (!cityCanon.has(k)) cityCanon.set(k, city.trim());
    return cityCanon.get(k)!;
  };

  // ---- Areas sheet ----
  for (const { row, values } of areaRows) {
    const errors: string[] = [];
    const city = (values.city ?? '').trim();
    const name = (values.area ?? '').trim();
    if (city.length < 2 || city.length > 80) errors.push('City is required (2-80 characters)');
    if (name.length < 1 || name.length > 80) errors.push('Area is required (1-80 characters)');
    let status: ImportStatus = 'valid';
    if (errors.length) status = 'error';
    else {
      const c = canonCity(city);
      const key = `${ci(c)}|${ci(name)}`;
      if (areaKnown.has(key) || newAreaKeys.has(key)) {
        status = 'duplicate';
        errors.push('Area already exists in this city');
      } else {
        newAreaKeys.add(key);
        areas.push({ row, city: c, name });
      }
    }
    results.push({ sheet: 'Areas', row, label: name, city, area: name, ownerPhone: '', status, messages: errors });
  }

  // ---- Halls sheet ----
  for (const { row, values } of hallRows) {
    const v = values as RawRow;
    const errors: string[] = [];
    const city = (v.city ?? '').trim();
    const area = (v.area ?? '').trim();
    const name = (v.name ?? '').trim();
    const address = (v.address ?? '').trim();

    if (city.length < 2 || city.length > 80) errors.push('City is required (2-80 characters)');
    if (area.length < 1 || area.length > 80) errors.push('Area is required (1-80 characters)');
    if (name.length < 2 || name.length > 120) errors.push('Hall Name is required (2-120 characters)');
    if (address.length < 2) errors.push('Address is required');

    const price = parseInt0(v.price ?? '', 'Price Per Day', LIMITS.price, errors, { required: true, min: 1 });
    const capacity = parseInt0(v.capacity ?? '', 'Seating Capacity', LIMITS.headcount, errors, { required: true, min: 1 });
    const diningCapacity = parseInt0(v.diningCapacity ?? '', 'Dining Capacity', LIMITS.headcount, errors) ?? 0;
    const perEventPrice = parseInt0(v.perEventPrice ?? '', 'Per Event Price', LIMITS.perEventPrice, errors);
    const advancePercent = parseInt0(v.advancePercent ?? '', 'Advance Percent', 100, errors) ?? 50;
    const hasRooms = parseBool(v.hasRooms ?? '', 'Has Guest Rooms', errors);
    const hasAC = parseBool(v.hasAC ?? '', 'Air Conditioned', errors);

    const amenities = [...new Set((v.amenities ?? '').split(/[,;\n]/).map((a) => a.trim()).filter(Boolean))];
    if (amenities.length > 40) errors.push('At most 40 amenities allowed');
    if (amenities.some((a) => a.length > 40)) errors.push('Each amenity must be 40 characters or fewer');

    let latitude: number | null = null;
    let longitude: number | null = null;
    if (v.latitude) {
      latitude = Number(v.latitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) { errors.push('Latitude must be between -90 and 90'); latitude = null; }
    }
    if (v.longitude) {
      longitude = Number(v.longitude);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) { errors.push('Longitude must be between -180 and 180'); longitude = null; }
    }
    if ((v.cancellationPolicy ?? '').length > 2000) errors.push('Cancellation Policy must be 2000 characters or fewer');
    if ((v.houseRules ?? '').length > 2000) errors.push('House Rules must be 2000 characters or fewer');
    let imageUrl: string | null = null;
    if (v.imageUrl) {
      try {
        const u = new URL(v.imageUrl);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
        imageUrl = v.imageUrl;
      } catch { errors.push('Image URL must be a valid http(s) link'); }
    }

    // Owner
    const ownerName = (v.ownerName ?? '').trim();
    const ownerPhone = normalizePhone(v.ownerPhone ?? '');
    const ownerEmail = (v.ownerEmail ?? '').trim().toLowerCase() || null;
    if (ownerName.length < 2 || ownerName.length > 120) errors.push('Owner Name is required (2-120 characters)');
    if (!(v.ownerPhone ?? '').trim()) errors.push('Owner Mobile is required');
    else if (!ownerPhone) errors.push('Owner Mobile is not a valid phone number');
    if (ownerEmail && !EMAIL_RE.test(ownerEmail)) errors.push('Owner Email is not a valid email address');

    let contactNumber = '';
    if (v.contactNumber) {
      const c = normalizePhone(v.contactNumber);
      if (!c) errors.push('Hall Contact Number is not a valid phone number');
      else contactNumber = c;
    } else if (ownerPhone) contactNumber = ownerPhone;

    let newOwner = false;
    if (ownerPhone) {
      const existing = userByPhone.get(ownerPhone);
      const inFile = fileOwners.get(ownerPhone);
      if (existing) {
        if (existing.role !== 'OWNER') errors.push(`Owner Mobile ${ownerPhone} belongs to a ${existing.role} account, not a hall owner`);
        else if (ownerEmail && existing.email && ci(existing.email) !== ownerEmail) errors.push('Owner Email differs from the email on the existing owner account');
        else if (ownerEmail && !existing.email) {
          const holder = userByEmail.get(ownerEmail);
          if (holder && holder.phone !== ownerPhone) errors.push('Owner Email already belongs to another account');
        }
      } else {
        if (inFile) {
          if ((ownerEmail ?? '') !== (inFile.email ?? '')) errors.push(`Owner Email differs from row ${inFile.row}, which uses the same mobile number`);
        } else if (ownerEmail) {
          const holder = userByEmail.get(ownerEmail);
          if (holder) errors.push('Owner Email already belongs to another account');
          else {
            const clash = [...fileOwners.entries()].find(([p, o]) => p !== ownerPhone && o.email === ownerEmail);
            if (clash) errors.push(`Owner Email is already used by a different owner mobile in row ${clash[1].row}`);
          }
        }
        newOwner = !inFile;
      }
    }

    // Business rule shared with the approval flow: the listing must be complete
    if (!errors.length) {
      const missing = missingHallFields({ name, city, area, address, price: price!, capacity: capacity!, contactNumber });
      if (missing.length) errors.push(`Incomplete listing: ${missing.join(', ')}`);
    }

    let status: ImportStatus = 'valid';
    if (errors.length) status = 'error';
    else {
      const cityC = canonCity(city);
      const hallKey = `${ci(name)}|${ci(cityC)}|${ci(area)}`;
      if (hallKnown.has(hallKey)) { status = 'duplicate'; errors.push('A hall with this name already exists in this city and area'); }
      else if (seenHalls.has(hallKey)) { status = 'duplicate'; errors.push('Duplicate of an earlier row in this file'); }
      else {
        seenHalls.add(hallKey);
        if (ownerPhone && !fileOwners.has(ownerPhone)) fileOwners.set(ownerPhone, { name: ownerName, email: ownerEmail, row });
        if (newOwner && ownerPhone) newOwnerPhones.add(ownerPhone);
        const areaKey = `${ci(cityC)}|${ci(area)}`;
        if (!areaKnown.has(areaKey) && !newAreaKeys.has(areaKey)) {
          newAreaKeys.add(areaKey);
          areas.push({ row, city: cityC, name: area });
        }
        halls.push({
          row,
          data: {
            city: cityC, area, name, address, price: price!, capacity: capacity!, diningCapacity, hasRooms, hasAC,
            amenities, contactNumber, description: v.description?.trim() || null, latitude, longitude,
            perEventPrice, advancePercent, cancellationPolicy: v.cancellationPolicy?.trim() || null,
            houseRules: v.houseRules?.trim() || null, imageUrl, ownerName, ownerPhone: ownerPhone!, ownerEmail,
          },
        });
      }
    }
    results.push({ sheet: 'Halls', row, label: name, city, area, ownerPhone: ownerPhone ?? (v.ownerPhone ?? ''), status, messages: errors });
  }

  const count = (s: ImportStatus) => results.filter((r) => r.status === s).length;
  return {
    results,
    halls,
    areas,
    summary: {
      total: results.length,
      valid: count('valid'),
      duplicates: count('duplicate'),
      errors: count('error'),
      newOwners: newOwnerPhones.size,
      newAreas: areas.length,
    },
  };
}

/* ----------------------------- commit ----------------------------- */

/**
 * Writes every valid row in ONE transaction (all-or-nothing). Rows that failed validation or are
 * duplicates are skipped and reported. Imported halls are always `isApproved: false` — they go live
 * only through the normal SuperAdmin approve action. Owners get an unusable random password and sign
 * in with the existing phone OTP flow, exactly like OTP-created accounts.
 */
export async function commitImport(buf: Buffer, actor: { id: string }) {
  const v = await validateImport(buf);
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

  const counts = await prisma.$transaction(
    async (tx) => {
      let areasCreated = 0, ownersCreated = 0, hallsCreated = 0;
      for (const a of v.areas) {
        const exists = await tx.area.findFirst({
          where: { city: { equals: a.city, mode: 'insensitive' }, name: { equals: a.name, mode: 'insensitive' } },
        });
        if (!exists) { await tx.area.create({ data: { city: a.city, name: a.name } }); areasCreated++; }
      }
      const ownerIds = new Map<string, string>();
      for (const { data } of v.halls) {
        let ownerId = ownerIds.get(data.ownerPhone);
        if (!ownerId) {
          const existing = await tx.user.findUnique({ where: { phone: data.ownerPhone } });
          if (existing) {
            ownerId = existing.id;
            if (existing.role !== 'OWNER') throw new Error(`${data.ownerPhone} is not a hall owner account`);
            if (data.ownerEmail && !existing.email) await tx.user.update({ where: { id: existing.id }, data: { email: data.ownerEmail } });
          } else {
            const u = await tx.user.create({
              data: { name: data.ownerName, phone: data.ownerPhone, email: data.ownerEmail, passwordHash, role: 'OWNER' },
            });
            ownerId = u.id;
            ownersCreated++;
          }
          ownerIds.set(data.ownerPhone, ownerId);
        }
        const { ownerName: _n, ownerPhone: _p, ownerEmail: _e, ...hall } = data;
        await tx.hall.create({ data: { ...hall, ownerId, isApproved: false } });
        hallsCreated++;
      }
      return { areasCreated, ownersCreated, hallsCreated };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  const savedRows = new Set(v.halls.map((h) => h.row));
  for (const r of v.results) r.saved = r.sheet === 'Halls' && r.status === 'valid' && savedRows.has(r.row);
  for (const r of v.results) if (r.sheet === 'Areas' && r.status === 'valid') r.saved = true;

  // Audit trail (the schema has no audit table; do not invent one)
  console.info(`[bulk-import] superadmin=${actor.id} halls=${counts.hallsCreated} owners=${counts.ownersCreated} areas=${counts.areasCreated} skipped=${v.summary.duplicates} failed=${v.summary.errors}`);

  return {
    results: v.results,
    summary: { ...v.summary, ...counts, skipped: v.summary.duplicates, failed: v.summary.errors },
  };
}

/* ----------------------------- template & report ----------------------------- */

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A1F2B' } } as const;
const OPTIONAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } } as const;

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const halls = wb.addWorksheet('Halls', { views: [{ state: 'frozen', ySplit: 1 }] });
  halls.columns = HALL_COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width }));
  halls.getRow(1).eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HALL_COLUMNS[i - 1].required ? HEADER_FILL : OPTIONAL_FILL;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  halls.addRow({
    city: 'Coimbatore', area: 'RS Puram', name: 'Sri Lakshmi Mahal', address: '12, DB Road, RS Puram, Coimbatore 641002',
    price: 120000, capacity: 500, diningCapacity: 300, hasRooms: 'Yes', hasAC: 'Yes',
    amenities: 'Wifi, Valet Parking, Bridal Room, In-house catering', contactNumber: '9876543210',
    description: 'Spacious AC hall with a grand dining area.', latitude: 11.0168, longitude: 76.9558,
    perEventPrice: 180000, advancePercent: 50, cancellationPolicy: 'Full refund up to 30 days before the event.',
    houseRules: 'No fireworks inside the hall.', imageUrl: '', ownerName: 'Ramesh Kumar', ownerPhone: '9876543210', ownerEmail: 'ramesh@example.com',
  });
  halls.addRow({
    city: 'Coimbatore', area: 'Peelamedu', name: 'Annai Kalyana Mandapam', address: '45, Avinashi Road, Peelamedu, Coimbatore 641004',
    price: 80000, capacity: 300, diningCapacity: 200, hasRooms: 'No', hasAC: 'No', amenities: 'Generator backup, Sound system',
    ownerName: 'Meena Devi', ownerPhone: '+919123456780',
  });
  const yesNo: ExcelJS.DataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
  for (let r = 2; r <= MAX_ROWS + 1; r++) {
    halls.getCell(`H${r}`).dataValidation = yesNo;
    halls.getCell(`I${r}`).dataValidation = yesNo;
  }
  // phone / digits columns as text so Excel does not strip leading zeros or add exponents
  for (const col of ['K', 'U']) halls.getColumn(col).numFmt = '@';

  const areas = wb.addWorksheet('Areas', { views: [{ state: 'frozen', ySplit: 1 }] });
  areas.columns = [{ header: 'City *', key: 'city', width: 22 }, { header: 'Area *', key: 'area', width: 26 }];
  areas.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = HEADER_FILL; });
  areas.addRow({ city: 'Coimbatore', area: 'Saibaba Colony' });
  areas.addRow({ city: 'Madurai', area: 'Anna Nagar' });

  const help = wb.addWorksheet('Instructions');
  help.columns = [{ width: 28 }, { width: 14 }, { width: 90 }];
  help.addRow(['Bulk import - how to fill this workbook']).font = { bold: true, size: 14 };
  help.addRows([
    [],
    ['1. Fill the "Halls" sheet: one row per marriage hall, with its owner / manager on the same row.'],
    ['2. The "Areas" sheet is optional: use it to add localities that have no hall yet. Areas used on the Halls sheet are created automatically.'],
    ['3. Delete the two sample rows before uploading (or the sample halls will be imported).'],
    ['4. Existing cities, areas and owners (matched by mobile number) are reused - no duplicates are created.'],
    ['5. Imported halls are saved as PENDING. They appear on the website only after a SuperAdmin approves them.'],
    ['6. Owners sign in with the mobile-number OTP login. No password is needed in this file.'],
    [`7. Maximum ${MAX_ROWS} rows and 5 MB per file. Only .xlsx is accepted.`],
    [],
  ]);
  const head = help.addRow(['Column (Halls sheet)', 'Required', 'Format / rule']);
  head.font = { bold: true };
  for (const c of HALL_COLUMNS) help.addRow([c.header, c.required ? 'Yes' : 'No', c.note]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildReport(results: ImportRowResult[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Import report', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Sheet', key: 'sheet', width: 10 },
    { header: 'Row', key: 'row', width: 8 },
    { header: 'Hall / Area', key: 'label', width: 30 },
    { header: 'City', key: 'city', width: 18 },
    { header: 'Area', key: 'area', width: 20 },
    { header: 'Owner Mobile', key: 'ownerPhone', width: 18 },
    { header: 'Result', key: 'result', width: 16 },
    { header: 'Messages', key: 'messages', width: 80 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = HEADER_FILL;
  // text-only cell values: strip leading formula characters so a hostile sheet cannot inject formulas
  const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  for (const r of results) {
    const result = r.saved ? 'Imported' : r.status === 'valid' ? 'Ready' : r.status === 'duplicate' ? 'Skipped (duplicate)' : 'Failed';
    ws.addRow({
      sheet: r.sheet, row: r.row, label: safe(r.label), city: safe(r.city), area: safe(r.area),
      ownerPhone: safe(r.ownerPhone), result, messages: safe(r.messages.join('; ')),
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
