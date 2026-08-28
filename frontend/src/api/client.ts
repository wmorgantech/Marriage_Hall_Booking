import type {
  Hall,
  Availability,
  User,
  AuthResponse,
  RegisterRequest,
  SearchHallsQuery,
  HallFilters,
  CreateHallRequest,
  AvailabilityStatus,
  Role,
} from './types';

export type SessionUser = AuthResponse['user'];
export type { Hall, Availability, User as AuthUser, HallFilters, Role };

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

function getToken(): string | null {
  return localStorage.getItem('cnb_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('cnb_token', token);
  else localStorage.removeItem('cnb_token');
}

export function setSessionUser(user: AuthResponse['user'] | null) {
  if (user) localStorage.setItem('cnb_user', JSON.stringify(user));
  else localStorage.removeItem('cnb_user');
}

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem('cnb_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  searchHalls: (params: SearchHallsQuery) => {
    const qs = new URLSearchParams();
    if (params.city) qs.set('city', params.city);
    if (params.area) qs.set('area', params.area);
    if (params.date) qs.set('date', params.date);
    if (params.fromDate) qs.set('fromDate', params.fromDate);
    if (params.toDate) qs.set('toDate', params.toDate);
    if (params.hasRooms) qs.set('hasRooms', 'true');
    if (params.hasAC) qs.set('hasAC', 'true');
    if (params.minPrice != null) qs.set('minPrice', String(params.minPrice));
    if (params.maxPrice != null) qs.set('maxPrice', String(params.maxPrice));
    if (params.q) qs.set('q', params.q);
    return request<Hall[]>(`/api/halls?${qs.toString()}`);
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
  login: (phone: string, password: string) =>
    request<AuthResponse>(`/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    }),
  adminLogin: (email: string, password: string) =>
    request<AuthResponse>(`/api/auth/admin-login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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

  // ---------- Admin ----------
  adminStats: () =>
    request<{
      totalHalls: number;
      pendingHalls: number;
      approvedHalls: number;
      totalOwners: number;
      totalUsers: number;
      totalBookedDates: number;
      totalCities: number;
      totalAreas: number;
      hallsByCity: { city: string; count: number }[];
      bookingsByDay: { date: string; count: number }[];
    }>(`/api/admin/stats`),
  adminListHalls: (
    opts: {
      approved: 'pending' | 'approved' | 'all';
      page?: number;
      limit?: number;
      q?: string;
      city?: string;
    },
  ) => {
    const map = { pending: 'false', approved: 'true', all: 'all' } as const;
    const qs = new URLSearchParams();
    qs.set('approved', map[opts.approved]);
    if (opts.page) qs.set('page', String(opts.page));
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.q) qs.set('q', opts.q);
    if (opts.city) qs.set('city', opts.city);
    return request<{
      halls: (Hall & { owner?: { id: string; name: string; phone: string } })[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/admin/halls?${qs.toString()}`);
  },
  adminListOwners: (opts: { page?: number; limit?: number; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.page) qs.set('page', String(opts.page));
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.q) qs.set('q', opts.q);
    return request<{
      owners: { id: string; name: string; phone: string; email: string | null; createdAt: string; _count: { halls: number } }[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/admin/owners?${qs.toString()}`);
  },
  adminListUsers: (opts: { page?: number; limit?: number; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.page) qs.set('page', String(opts.page));
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.q) qs.set('q', opts.q);
    return request<{
      users: { id: string; name: string; phone: string; email: string | null; createdAt: string }[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/admin/users?${qs.toString()}`);
  },
  // ---------- Areas ----------
  getAreas: (city?: string) => {
    const qs = new URLSearchParams();
    if (city) qs.set('city', city);
    return request<{ id: string; city: string; name: string; createdAt: string }[]>(
      `/api/areas${qs.toString() ? '?' + qs.toString() : ''}`,
    );
  },
  adminListAreas: (opts: { page?: number; limit?: number; q?: string; city?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.page) qs.set('page', String(opts.page));
    if (opts.limit) qs.set('limit', String(opts.limit));
    if (opts.q) qs.set('q', opts.q);
    if (opts.city) qs.set('city', opts.city);
    return request<{
      areas: { id: string; city: string; name: string; createdAt: string; hallCount: number }[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/admin/areas?${qs.toString()}`);
  },
  adminCreateArea: (city: string, name: string) =>
    request<{ id: string; city: string; name: string; createdAt: string }>(
      `/api/admin/areas`,
      { method: 'POST', body: JSON.stringify({ city, name }) },
    ),
  adminUpdateArea: (id: string, body: { city?: string; name?: string }) =>
    request<{ id: string; city: string; name: string; createdAt: string }>(
      `/api/admin/areas/${id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  adminDeleteArea: (id: string, force = false) =>
    request<void>(`/api/admin/areas/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  getSettings: () =>
    request<{ customerCarePhone: string; customerCareEmail: string; updatedAt: string }>(
      `/api/settings`,
    ),
  updateSettings: (body: { customerCarePhone?: string; customerCareEmail?: string }) =>
    request<{ customerCarePhone: string; customerCareEmail: string; updatedAt: string }>(
      `/api/admin/settings`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  adminRecentBookings: (limit = 8) =>
    request<
      {
        id: string;
        date: string;
        createdAt: string;
        hall: { id: string; name: string; city: string; area: string; isApproved: boolean };
      }[]
    >(`/api/admin/recent-bookings?limit=${limit}`),
  adminApproveHall: (id: string) =>
    request<Hall>(`/api/admin/halls/${id}/approve`, { method: 'POST' }),
  adminRejectHall: (id: string) =>
    request<Hall>(`/api/admin/halls/${id}/reject`, { method: 'POST' }),
  adminDeleteHall: (id: string) =>
    request<void>(`/api/admin/halls/${id}`, { method: 'DELETE' }),
};
