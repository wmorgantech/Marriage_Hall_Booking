import jwt from 'jsonwebtoken';

const ACCESS_EXPIRES_S = Number(process.env.JWT_ACCESS_EXPIRES_S) || 7200;
const REFRESH_EXPIRES_S = Number(process.env.JWT_REFRESH_EXPIRES_S) || 604800;

export type TokenPayload = {
  sub: string;
  role: 'USER' | 'OWNER' | 'ADMIN' | 'SUPERADMIN';
  type?: 'access' | 'refresh';
};

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set — add it to backend/.env.development (or .env).');
  return s;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, secret(), { expiresIn: ACCESS_EXPIRES_S });
}

export function signRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, secret(), { expiresIn: REFRESH_EXPIRES_S });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, secret()) as TokenPayload;
  if (decoded.type === 'refresh') throw new Error('Refresh token cannot be used as access token');
  return decoded;
}

export function verifyRefreshToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, secret()) as TokenPayload;
  if (decoded.type !== 'refresh') throw new Error('Not a refresh token');
  return decoded;
}
