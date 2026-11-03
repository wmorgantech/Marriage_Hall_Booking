import jwt from 'jsonwebtoken';

const EXPIRES_IN = '7d';

export type TokenPayload = {
  sub: string;  // user id
  role: 'USER' | 'OWNER' | 'ADMIN' | 'SUPERADMIN';
};

// Read lazily so the env file is guaranteed to be loaded, and never fall back
// to a guessable default secret.
function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set — add it to backend/.env.development (or .env).');
  return s;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, secret()) as TokenPayload;
}
