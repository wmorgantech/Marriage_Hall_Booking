import { secureStorage } from './secureStorage';
import { API_BASE_URL } from './config';
import type {
  AiSearchResponse,
  Availability,
  AvailabilityStatus,
  AuthResponse,
  Booking,
  CreateBookingRequest,
  CreateHallRequest,
  Hall,
  HallFilters,
  RegisterRequest,
  SearchHallsQuery,
  SessionUser,
  User,
} from './types';

const TOKEN_KEY = 'cnb_token';
const USER_KEY = 'cnb_user';

export async function getToken(): Promise<string | null> {
  return secureStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await secureStorage.setItem(TOKEN_KEY, token);
  else await secureStorage.removeItem(TOKEN_KEY);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = await secureStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function setSessionUser(user: SessionUser | null): Promise<void> {
  if (user) await secureStorage.setItem(USER_KEY, JSON.stringify(user));
  else await secureStorage.removeItem(USER_KEY);
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = await getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** "98765 43210" | "+91 98765-43210" | "919876543210" → "+919876543210" (E.164), or null if it isn't a valid number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export const api = {
  aiSearchHalls: (query: string, opts?: { limit?: number; offset?: number }) =>
    request<AiSearchResponse>('/api/halls/ai-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, ...opts }),
    }),
  /** One page of results plus the total number of matching halls (X-Total-Count). */
  searchHalls: async (params: SearchHallsQuery): Promise<{ halls: Hall[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params.city) qs.set('city', params.city);
    if (params.area) qs.set('area', params.area);
    if (params.date) qs.set('date', params.date);
    if (params.fromDate) qs.set('fromDate', params.fromDate);
    if (params.toDate) qs.set('toDate', params.toDate);
    if (params.hasRooms) qs.set('hasRooms', 'true');
    if (params.hasAC) qs.set('hasAC', 'true');
    if (params.hasDining) qs.set('hasDining', 'true');
    if (params.amenities?.length) qs.set('amenities', params.amenities.join(','));
    if (params.minPrice != null) qs.set('minPrice', String(params.minPrice));
    if (params.maxPrice != null) qs.set('maxPrice', String(params.maxPrice));
    if (params.minCapacity != null) qs.set('minCapacity', String(params.minCapacity));
    if (params.maxCapacity != null) qs.set('maxCapacity', String(params.maxCapacity));
    if (params.sort) qs.set('sort', params.sort);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    if (params.q) qs.set('q', params.q);
    const res = await send(`/api/halls?${qs.toString()}`);
    const halls = (await res.json()) as Hall[];
    const header = res.headers.get('X-Total-Count');
    const total = header != null && Number.isFinite(Number(header)) ? Number(header) : halls.length;
    return { halls, total };
  },
  getHallFilters: () => request<HallFilters>(`/api/halls/filters`),
  suggestHalls: (q: string, limit = 8) => {
    const qs = new URLSearchParams();
    qs.set('q', q);
    qs.set('limit', String(limit));
    return request<Hall[]>(`/api/halls?${qs.toString()}`);
  },
  getHall: (id: string) => request<Hall>(`/api/halls/${id}`),
  getAvailability: (id: string, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return request<Availability[]>(`/api/halls/${id}/availability?${qs.toString()}`);
  },
  getAreas: (city?: string) => {
    const qs = new URLSearchParams();
    if (city) qs.set('city', city);
    return request<{ id: string; city: string; name: string; createdAt: string }[]>(
      `/api/areas${qs.toString() ? '?' + qs.toString() : ''}`,
    );
  },
  getSettings: () =>
    request<{ customerCarePhone: string; customerCareEmail: string; updatedAt: string }>(
      `/api/settings`,
    ),

  // ---------- Auth ----------
  login: (phone: string, password: string) =>
    request<AuthResponse>(`/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    }),
  register: (body: RegisterRequest) =>
    request<AuthResponse>(`/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: () => request<User>(`/api/auth/me`),
  requestOtp: (phone: string) =>
    request<{ ok: true }>(`/api/auth/otp/request`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, otp: string, name?: string) =>
    request<AuthResponse>(`/api/auth/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ phone, otp, name }),
    }),

  // ---------- Owner ----------
  myHalls: () => request<Hall[]>(`/api/halls/mine`),
  createHall: (body: CreateHallRequest) =>
    request<Hall>(`/api/halls`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateHall: (id: string, body: Partial<CreateHallRequest>) =>
    request<Hall>(`/api/halls/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  setAvailability: (hallId: string, dates: string[], status: AvailabilityStatus) =>
    request<{ updated: number }>(`/api/halls/${hallId}/availability`, {
      method: 'POST',
      body: JSON.stringify({ dates, status }),
    }),

  // ---------- Bookings ----------
  createBooking: (body: CreateBookingRequest) =>
    request<Booking>(`/api/bookings`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getMyBookings: () => request<Booking[]>(`/api/bookings/mine`),
  cancelBooking: (id: string) => request<Booking>(`/api/bookings/${id}/cancel`, { method: 'POST' }),

  // ---------- Owner: bookings for a hall ----------
  hallBookings: (hallId: string) => request<Booking[]>(`/api/halls/${hallId}/bookings`),
  confirmBooking: (id: string) => request<Booking>(`/api/bookings/${id}/confirm`, { method: 'POST' }),
};
