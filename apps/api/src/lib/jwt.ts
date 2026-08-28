import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me';
const EXPIRES_IN = '7d';

export type TokenPayload = {
  sub: string;  // user id
  role: 'USER' | 'OWNER' | 'ADMIN' | 'SUPERADMIN';
};

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}
