import { describe, expect, it } from 'vitest';
import { missingHallFields, withContact } from '../src/lib/hall';

const complete = {
  name: 'Sri Mahal',
  city: 'Coimbatore',
  area: 'RS Puram',
  address: 'No. 4, RS Puram',
  price: 120000,
  capacity: 500,
  contactNumber: '+910000012345',
};

describe('missingHallFields', () => {
  it('returns nothing for a complete listing', () => {
    expect(missingHallFields(complete)).toEqual([]);
  });

  it('lists everything an owner-registered blank draft is missing', () => {
    const draft = { ...complete, city: '', area: '', address: '', price: 0, capacity: 0 };
    expect(missingHallFields(draft)).toEqual(['city', 'area', 'address', 'price', 'capacity']);
  });

  it('treats whitespace-only text as missing', () => {
    expect(missingHallFields({ ...complete, city: '   ', name: ' ' })).toEqual(['name', 'city']);
  });
});

describe('withContact', () => {
  it('hides the number from anonymous callers and keeps the rest of the hall intact', () => {
    expect(withContact({ id: 'h1', contactNumber: '+910000012345' }, false)).toEqual({ id: 'h1', contactNumber: '' });
  });

  it('keeps the number for signed-in callers', () => {
    expect(withContact({ id: 'h1', contactNumber: '+910000012345' }, true).contactNumber).toBe('+910000012345');
  });
});
