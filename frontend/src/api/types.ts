// Shared types between @checknbook/api and @checknbook/web.
// Keep this module free of runtime dependencies — types only.

export type Role = 'USER' | 'OWNER' | 'ADMIN' | 'SUPERADMIN';
export type AvailabilityStatus = 'AVAILABLE' | 'BOOKED';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: Role;
  createdAt: string;
}

export interface Hall {
  id: string;
  name: string;
  city: string;
  area: string;
  address: string;
  price: number;
  capacity: number;
  hasRooms: boolean;
  hasAC: boolean;
  imageUrl?: string | null;
  contactNumber: string;
  description?: string | null;
  isApproved: boolean;
  ownerId: string;
  createdAt: string;
  latitude?: number | null;
  longitude?: number | null;
  diningCapacity?: number;
  amenities?: string[];
  imageUrls?: string[];
  perEventPrice?: number | null;
  advancePercent?: number;
  cancellationPolicy?: string | null;
  houseRules?: string | null;
  /** Readable URL from the API, e.g. /halls/kongu-palace-chromepet/chennai (falls back to /halls/<id>). */
  path?: string;
  /** Only on multi-date searches: which of `checkedDates` the hall is free on (bookings included). */
  freeDates?: string[];
  checkedDates?: string[];
}

export type DateMatch = 'all' | 'any';

export interface Availability {
  id: string;
  hallId: string;
  date: string;               // ISO date, YYYY-MM-DD
  status: AvailabilityStatus;
  /** 'booking' = held by a PENDING/CONFIRMED booking (no customer details are sent). */
  source?: 'owner' | 'booking';
}

// ---------- Request / Response DTOs ----------

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  phone: string;
  email?: string;
  password: string;
  hallName?: string;
}

export interface AuthResponse {
  token: string;
  user: Pick<User, 'id' | 'name' | 'phone' | 'role'>;
}

export interface SearchHallsQuery {
  city?: string;
  area?: string;
  date?: string;           // single-date shorthand (kept for back-compat)
  fromDate?: string;       // ISO YYYY-MM-DD
  toDate?: string;         // ISO YYYY-MM-DD
  dates?: string[];        // several separate dates (max 10)
  match?: DateMatch;       // all = free on every date (default), any = on at least one
  hasRooms?: boolean;
  hasAC?: boolean;
  hasDining?: boolean;
  amenities?: string[];    // hall must have every one
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minCapacity?: number;
  maxCapacity?: number;
  sort?: 'popularity' | 'price-asc' | 'capacity-desc';
  limit?: number;
  offset?: number;
}

export interface HallFilters {
  cities: string[];
  areasByCity: Record<string, string[]>;
  priceRange?: { min: number; max: number };
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type BookingEventType = 'wedding' | 'engagement' | 'reception' | 'birthday' | 'corporate' | 'other';

export interface Booking {
  id: string;
  hallId: string;
  userId: string;
  date: string;               // ISO date
  eventType: BookingEventType;
  guestCount: number;
  customerName: string;
  customerPhone: string;
  specialRequests?: string | null;
  paymentMethod: 'upi' | 'card' | 'netbanking' | 'cash';
  advanceAmount: number;
  totalAmount: number;
  status: BookingStatus;
  createdAt: string;
}

export interface CreateHallRequest {
  name: string;
  city: string;
  area: string;
  address: string;
  price: number;
  capacity: number;
  hasRooms?: boolean;
  hasAC?: boolean;
  imageUrl?: string;
  contactNumber: string;
  description?: string;
}

export interface SetAvailabilityRequest {
  dates: string[];
  status: AvailabilityStatus;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
