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
}

export interface Availability {
  id: string;
  hallId: string;
  date: string;               // ISO date, YYYY-MM-DD
  status: AvailabilityStatus;
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
  hasRooms?: boolean;
  hasAC?: boolean;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
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

export interface SetAvailabilityRequest {
  dates: string[];
  status: AvailabilityStatus;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
