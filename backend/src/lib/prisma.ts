import { PrismaClient } from '@prisma/client';

const POOL_SIZE = Number(process.env.DB_POOL_SIZE) || 10;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        url: appendPoolSize(process.env.DATABASE_URL ?? '', POOL_SIZE),
      },
    },
  });

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

function appendPoolSize(url: string, size: number): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  if (/connection_limit=/i.test(url)) return url;
  return `${url}${sep}connection_limit=${size}`;
}
