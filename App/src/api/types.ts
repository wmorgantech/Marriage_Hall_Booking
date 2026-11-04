// Mirrors packages/types/src/index.ts from the web/api repo, extended with the
// "rich listing" Hall fields the API already returns (added to the Prisma
// schema later than the shared types package, so they're optional here).

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
  imageUrls?: string[];
  contactNumber: string;
  description?: string | null;
  isApproved: boolean;
  ownerId: string;
  createdAt: string;
  latitude?: number | null;
  longitude?: number | null;
  diningCapacity?: number;
  amenities?: string[];
  perEventPrice?: number | null;
  advancePercent?: number;
  cancellationPolicy?: string | null;
  houseRules?: string | null;
}

export interface Availability {
  id: string;
  hallId: string;
  date: string; // ISO date, YYYY-MM-DD
  status: AvailabilityStatus;
}

export type BookingEventType = 'wedding' | 'engagement' | 'reception' | 'birthday' | 'corporate' | 'other';
export type BookingPaymentMethod = 'upi' | 'card' | 'netbanking' | 'cash';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export interface Booking {
  id: string;
  hallId: string;
  userId: string;
  date: string; // ISO date, YYYY-MM-DD
  eventType: BookingEventType;
  guestCount: number;
  customerName: string;
  customerPhone: string;
  specialRequests?: string | null;
  paymentMethod: BookingPaymentMethod;
  advanceAmount: number;
  totalAmount: number;
  status: BookingStatus;
  createdAt: string;
  hall?: Pick<Hall, 'id' | 'name' | 'city' | 'area' | 'imageUrl' | 'contactNumber'>;
}

export interface CreateBookingRequest {
  hallId: string;
  date: string;
  eventType: BookingEventType;
  guestCount: number;
  customerName: string;
  customerPhone: string;
  specialRequests?: string;
  paymentMethod: BookingPaymentMethod;
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

export type SessionUser = AuthResponse['user'];

export interface SearchHallsQuery {
  city?: string;
  area?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
  hasRooms?: boolean;
  hasAC?: boolean;
  hasDining?: boolean;
  amenities?: string[]; // hall must have every one
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

export interface ApiError {
  error: string;
  details?: unknown;
}

/** Result of POST /api/halls/ai-search — rule-based natural-language search with verified availability. */
export interface AiSearchResponse {
  engine: 'rules';
  query: string;
  criteria: { city?: string; area?: string; date?: string; preferences: string[] };
  issues: { code: string; message: string; blocking?: boolean }[];
  understood: { key: string; label: string; value: string }[];
  searched: boolean;
  total: number;
  halls: (Hall & {
    ai: {
      availability: { verified: true; date: string } | { verified: false; reason: string };
      preferences: { asked: string[]; confirmed: string[]; notListed: string[] };
    };
  })[];
  notes: string[];
}
