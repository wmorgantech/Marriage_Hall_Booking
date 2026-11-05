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
  Booking,
  BookingStatus,
  Role,
  DateMatch,
} from './types';

export type SessionUser = AuthResponse['user'];
export type { Hall, Availability, User as AuthUser, HallFilters, Role, Booking, BookingStatus, DateMatch };

/** Where a hall's page lives: the readable URL from the API, else the id URL (which redirects). */
export function hallHref(h: Pick<Hall, 'id' | 'path'>): string {
  return h.path ?? `/halls/${encodeURIComponent(h.id)}`;
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/** "98765 43210" | "+91 98765-43210" | "919876543210" → "+919876543210" (E.164), or null if it isn't a valid number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function getToken(): string | null {
  return localStorage.getItem('cnb_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('cnb_token', token);
  else localStorage.removeItem('cnb_token');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('cnb_refresh_token');
}

export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem('cnb_refresh_token', token);
  else localStorage.removeItem('cnb_refresh_token');
}

export function setSessionUser(user: AuthResponse['user'] | null) {
  if (user) localStorage.setItem('cnb_user', JSON.stringify(user));
  else localStorage.removeItem('cnb_user');
}

export function storeAuthResponse(res: AuthResponse) {
  setToken(res.token);
  if (res.refreshToken) setRefreshToken(res.refreshToken);
  setSessionUser(res.user);
}

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem('cnb_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  let res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401 && token && !path.includes('/auth/refresh')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers.authorization = `Bearer ${refreshed}`;
      res = await fetch(`${BASE}${path}`, { ...init, headers });
    }
  }

  if (!res.ok) {
    let msg = res.status === 429
      ? 'Too many requests right now. Please wait a minute and try again.'
      : `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        setToken(null);
        setRefreshToken(null);
        setSessionUser(null);
        return null;
      }
      const data = await res.json();
      setToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      return data.token as string;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type ImportRowResult = {
  sheet: 'Areas' | 'Halls';
  row: number;
  label: string;
  city: string;
  area: string;
  ownerPhone: string;
  status: 'valid' | 'duplicate' | 'error';
  messages: string[];
  saved?: boolean;
};
export type ImportPreview = {
  results: ImportRowResult[];
  summary: { total: number; valid: number; duplicates: number; errors: number; newOwners: number; newAreas: number };
};
export type ImportCommit = {
  results: ImportRowResult[];
  summary: ImportPreview['summary'] & { hallsCreated: number; ownersCreated: number; areasCreated: number; skipped: number; failed: number };
};

/** Authenticated file download (the token lives in a header, so a plain <a href> cannot be used). */
async function downloadBlob(path: string, init: RequestInit | undefined, filename: string): Promise<void> {
  const res = await send(path, init);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function hallSearchQs(params: SearchHallsQuery): string {
  const qs = new URLSearchParams();
  if (params.city) qs.set('city', params.city);
  if (params.area) qs.set('area', params.area);
  if (params.date) qs.set('date', params.date);
  if (params.fromDate) qs.set('fromDate', params.fromDate);
  if (params.toDate) qs.set('toDate', params.toDate);
  if (params.dates?.length) { qs.set('dates', params.dates.join(',')); qs.set('match', params.match ?? 'all'); }
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
  return qs.toString();
}

export type AiCriteria = {
  city?: string; area?: string; date?: string; dates?: string[]; match?: DateMatch;
  minCapacity?: number; maxPrice?: number; minPrice?: number;
  hasAC?: true; hasRooms?: true; hasDining?: true; preferences: string[]; cheapFirst?: true;
};

/** Result of POST /api/halls/ai-search (rule-based natural-language search with verified availability). */
export type AiSearchResponse = {
  engine: 'rules';
  query: string;
  criteria: AiCriteria;
  issues: { code: string; message: string; blocking?: boolean }[];
  understood: { key: string; label: string; value: string }[];
  searched: boolean;
  total: number;
  halls: (Hall & {
    ai: {
      availability:
        | { verified: true; date: string; dates: string[]; freeDates: string[]; match: DateMatch }
        | { verified: false; reason: string };
      preferences: { asked: string[]; confirmed: string[]; notListed: string[] };
      score: number;
      reasons: string[];
      bestMatch?: true;
    };
  })[];
  notes: string[];
  /** Only when nothing matches: real searches with one thing relaxed, each with its real count. */
  alternatives: { code: string; label: string; criteria: AiCriteria; total: number }[];
};

export type AiSearchOptions = { limit?: number; offset?: number; criteria?: AiCriteria; previous?: AiCriteria };

export const api = {
  aiSearchHalls: (query: string, opts?: AiSearchOptions) =>
    request<AiSearchResponse>(`/api/halls/ai-search`, { method: 'POST', body: JSON.stringify({ query, ...opts }) }),
  /** One page of results plus the total number of matching halls (X-Total-Count). */
  searchHalls: async (params: SearchHallsQuery): Promise<{ halls: Hall[]; total: number }> => {
    const res = await send(`/api/halls?${hallSearchQs(params)}`);
    const halls = (await res.json()) as Hall[];
    const total = Number(res.headers.get('X-Total-Count'));
    return { halls, total: Number.isFinite(total) && res.headers.has('X-Total-Count') ? total : halls.length };
  },
  getHallFilters: () => request<HallFilters>(`/api/halls/filters`),
  suggestHalls: (q: string, limit = 8) => {
    const qs = new URLSearchParams();
    qs.set('q', q);
    qs.set('limit', String(limit));
    return request<Hall[]>(`/api/halls?${qs.toString()}`);
  },
  getHall: (id: string) => request<Hall>(`/api/halls/${encodeURIComponent(id)}`),
  /** Hall by its readable URL (/halls/<slug>/<city>). */
  getHallByPath: (slug: string, city: string) =>
    request<Hall>(`/api/halls/url/${encodeURIComponent(slug)}/${encodeURIComponent(city)}`),
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
  registerOtp: (body: { name: string; phone: string; email?: string; otp: string; hallName: string }) =>
    request<AuthResponse>(`/api/auth/register-otp`, {
      method: 'POST',
      body: JSON.stringify(body),
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
  hallBookings: (hallId: string) => request<Booking[]>(`/api/halls/${hallId}/bookings`),
  confirmBooking: (id: string) => request<Booking>(`/api/bookings/${id}/confirm`, { method: 'POST' }),
  cancelBooking: (id: string) => request<Booking>(`/api/bookings/${id}/cancel`, { method: 'POST' }),

  // ---------- Admin ----------
  adminStats: () =>
    request<{
      totalHalls: number;
      pendingHalls: number;
      approvedHalls: number;
      totalOwners: number;
      totalUsers: number;
      totalBookedDates: number;
      totalBookings: number;
      pendingBookings: number;
      confirmedBookings: number;
      cancelledBookings: number;
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

  adminListAdmins: () =>
    request<{ id: string; name: string; email: string | null; phone: string; role: string; createdAt: string }[]>(
      `/api/admin/admins`,
    ),
  adminResetAdminPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/admin/admins/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  getMuhurthamDates: () => request<string[]>(`/api/muhurtham-dates`),
  adminAddMuhurthamDates: (dates: string[]) =>
    request<string[]>(`/api/admin/muhurtham-dates`, { method: 'POST', body: JSON.stringify({ dates }) }),
  adminRemoveMuhurthamDates: (dates: string[]) =>
    request<string[]>(`/api/admin/muhurtham-dates`, { method: 'DELETE', body: JSON.stringify({ dates }) }),
  adminImportTemplate: () => downloadBlob(`/api/admin/import/template`, undefined, 'hall-import-template.xlsx'),
  adminImportPreview: (file: File) =>
    request<ImportPreview>(`/api/admin/import/preview`, { method: 'POST', body: file, headers: { 'content-type': XLSX_MIME } }),
  adminImportCommit: (file: File) =>
    request<ImportCommit>(`/api/admin/import/commit`, { method: 'POST', body: file, headers: { 'content-type': XLSX_MIME } }),
  adminImportReport: (results: ImportRowResult[]) =>
    downloadBlob(`/api/admin/import/report`, { method: 'POST', body: JSON.stringify({ results }) }, 'hall-import-report.xlsx'),
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
        status: BookingStatus;
        customerName: string;
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
