import { prisma } from './prisma';

type Publishable = {
  name: string;
  city: string;
  area: string;
  address: string;
  price: number;
  capacity: number;
  contactNumber: string;
};

/** Fields a hall must have before it can be shown publicly. Empty list = complete. */
export function missingHallFields(h: Publishable): string[] {
  const missing: string[] = [];
  if (!h.name?.trim()) missing.push('name');
  if (!h.city?.trim()) missing.push('city');
  if (!h.area?.trim()) missing.push('area');
  if (!h.address?.trim()) missing.push('address');
  if (!(h.price > 0)) missing.push('price');
  if (!(h.capacity > 0)) missing.push('capacity');
  if (!h.contactNumber?.trim()) missing.push('contactNumber');
  return missing;
}

/** Keep the admin-managed Area table in step with the areas halls actually use. */
export async function ensureArea(city: string, area: string): Promise<void> {
  const c = city.trim();
  const a = area.trim();
  if (!c || !a) return;
  const existing = await prisma.area.findFirst({
    where: { city: { equals: c, mode: 'insensitive' }, name: { equals: a, mode: 'insensitive' } },
  });
  if (!existing) {
    // A concurrent insert can trip unique(city, name); that just means it exists.
    await prisma.area.create({ data: { city: c, name: a } }).catch(() => undefined);
  }
}

/** Contact numbers are only revealed to signed-in (OTP-verified) callers. */
export function withContact<T extends { contactNumber: string }>(hall: T, signedIn: boolean): T {
  return signedIn ? hall : { ...hall, contactNumber: '' };
}
