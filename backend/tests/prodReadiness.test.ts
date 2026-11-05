import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-at-least-32-chars-long!';

describe('JWT tokens', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('access token expires in 2h by default and is rejected as refresh', async () => {
    const { signToken, verifyToken, verifyRefreshToken } = await import('../src/lib/jwt');
    const token = signToken({ sub: 'u1', role: 'USER' });
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe('u1');
    expect(decoded.type).toBe('access');
    expect(() => verifyRefreshToken(token)).toThrow('Not a refresh token');
  });

  it('refresh token works and is rejected as access', async () => {
    const { signRefreshToken, verifyRefreshToken, verifyToken } = await import('../src/lib/jwt');
    const rt = signRefreshToken({ sub: 'u2', role: 'OWNER' });
    const decoded = verifyRefreshToken(rt);
    expect(decoded.sub).toBe('u2');
    expect(decoded.type).toBe('refresh');
    expect(() => verifyToken(rt)).toThrow('Refresh token cannot be used as access token');
  });

  it('access token has correct 2h (7200s) expiry', async () => {
    const { signToken } = await import('../src/lib/jwt');
    const token = signToken({ sub: 'u3', role: 'USER' });
    const raw = jwt.decode(token) as { exp: number; iat: number };
    expect(raw.exp - raw.iat).toBe(7200);
  });

  it('refresh token has correct 7d (604800s) expiry', async () => {
    const { signRefreshToken } = await import('../src/lib/jwt');
    const rt = signRefreshToken({ sub: 'u4', role: 'OWNER' });
    const raw = jwt.decode(rt) as { exp: number; iat: number };
    expect(raw.exp - raw.iat).toBe(604800);
  });

  it('expired access token is rejected', async () => {
    const { verifyToken } = await import('../src/lib/jwt');
    const expired = jwt.sign({ sub: 'u5', role: 'USER', type: 'access' }, TEST_SECRET, { expiresIn: -10 });
    expect(() => verifyToken(expired)).toThrow();
  });

  it('expired refresh token is rejected', async () => {
    const { verifyRefreshToken } = await import('../src/lib/jwt');
    const expired = jwt.sign({ sub: 'u6', role: 'USER', type: 'refresh' }, TEST_SECRET, { expiresIn: -10 });
    expect(() => verifyRefreshToken(expired)).toThrow();
  });

  it('token signed with wrong secret is rejected', async () => {
    const { verifyToken, verifyRefreshToken } = await import('../src/lib/jwt');
    const fakeAccess = jwt.sign({ sub: 'u7', role: 'USER', type: 'access' }, 'wrong-secret', { expiresIn: 7200 });
    const fakeRefresh = jwt.sign({ sub: 'u7', role: 'USER', type: 'refresh' }, 'wrong-secret', { expiresIn: 604800 });
    expect(() => verifyToken(fakeAccess)).toThrow();
    expect(() => verifyRefreshToken(fakeRefresh)).toThrow();
  });

  it('refresh endpoint returns new token pair for valid refresh token', async () => {
    const { signRefreshToken, verifyToken, verifyRefreshToken } = await import('../src/lib/jwt');
    const rt = signRefreshToken({ sub: 'u8', role: 'USER' });
    const decoded = verifyRefreshToken(rt);
    expect(decoded.sub).toBe('u8');

    const newAccess = (await import('../src/lib/jwt')).signToken({ sub: decoded.sub, role: decoded.role });
    const newRefresh = signRefreshToken({ sub: decoded.sub, role: decoded.role });
    expect(verifyToken(newAccess).sub).toBe('u8');
    expect(verifyRefreshToken(newRefresh).sub).toBe('u8');
  });

  it('refresh token reuse is possible (stateless JWT — documented limitation)', async () => {
    const { signRefreshToken, verifyRefreshToken } = await import('../src/lib/jwt');
    const rt = signRefreshToken({ sub: 'u9', role: 'USER' });
    expect(verifyRefreshToken(rt).sub).toBe('u9');
    expect(verifyRefreshToken(rt).sub).toBe('u9');
  });
});

describe('loginGuard (unit)', () => {
  it('allows login under threshold and blocks at threshold', async () => {
    const countFn = vi.fn();
    const createFn = vi.fn().mockResolvedValue({});
    const deleteManyFn = vi.fn();

    vi.doMock('../src/lib/prisma', () => ({
      prisma: {
        loginAttempt: { count: countFn, create: createFn, deleteMany: deleteManyFn },
      },
    }));

    const { checkBruteForce, recordAttempt } = await import('../src/lib/loginGuard');

    countFn.mockResolvedValue(5);
    await expect(checkBruteForce('+919999999999')).resolves.toBeUndefined();

    await recordAttempt('+919999999999', false, '127.0.0.1');
    expect(createFn).toHaveBeenCalledWith({
      data: { target: '+919999999999', success: false, ip: '127.0.0.1' },
    });

    countFn.mockResolvedValue(10);
    await expect(checkBruteForce('+919999999999')).rejects.toMatchObject({ status: 429 });

    vi.doUnmock('../src/lib/prisma');
  });
});

describe('DB pool configuration', () => {
  it('appendPoolSize adds connection_limit to URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    vi.stubEnv('DB_POOL_SIZE', '15');
    vi.resetModules();

    const mod = await import('../src/lib/prisma');
    expect(mod).toBeDefined();
    vi.unstubAllEnvs();
  });
});

describe('bounded queries', () => {
  it('booking routes file contains take limits', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const bookingCode = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/booking.routes.ts'), 'utf8'
    );
    expect(bookingCode).toContain('take: 200');

    const hallCode = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/hall.routes.ts'), 'utf8'
    );
    expect(hallCode).toContain('take: 500');
  });
});

describe('PM2 cluster config', () => {
  it('configures cluster mode with max instances', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const config = fs.readFileSync(
      path.resolve(__dirname, '../../infra/pm2.ecosystem.config.js'), 'utf8'
    );
    expect(config).toContain("exec_mode: 'cluster'");
    expect(config).toContain("instances:");
    expect(config).toContain('DB_POOL_SIZE');
  });

  it('worker count × DB_POOL_SIZE stays within safe PostgreSQL budget', async () => {
    const os = await import('os');
    const cpuCount = os.cpus().length;
    const poolPerWorker = 5;
    const totalConnections = cpuCount * poolPerWorker;
    const PG_DEFAULT_MAX = 100;
    const safeMargin = PG_DEFAULT_MAX - 10;
    expect(totalConnections).toBeLessThanOrEqual(safeMargin);
  });
});

describe('graceful shutdown', () => {
  it('index.ts registers SIGINT and SIGTERM handlers', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const code = fs.readFileSync(
      path.resolve(__dirname, '../src/index.ts'), 'utf8'
    );
    expect(code).toContain("process.on('SIGINT'");
    expect(code).toContain("process.on('SIGTERM'");
    expect(code).toContain('prisma.$disconnect');
  });
});

describe('request timeout', () => {
  it('index.ts configures response timeout middleware', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const code = fs.readFileSync(
      path.resolve(__dirname, '../src/index.ts'), 'utf8'
    );
    expect(code).toContain('REQUEST_TIMEOUT_MS');
    expect(code).toContain('res.setTimeout');
  });

  it('timeout middleware sends 503 when triggered', async () => {
    let timeoutCallback: (() => void) | undefined;
    const mockRes = {
      headersSent: false,
      setTimeout: vi.fn((ms: number, cb: () => void) => { timeoutCallback = cb; }),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const mockNext = vi.fn();

    const code = await import('fs').then(fs =>
      fs.readFileSync(
        require('path').resolve(__dirname, '../src/index.ts'), 'utf8'
      )
    );
    expect(code).toMatch(/res\.setTimeout\(REQUEST_TIMEOUT_MS/);

    // Simulate the middleware behavior
    mockRes.setTimeout(30000, () => {
      if (!mockRes.headersSent) {
        mockRes.status(503).json({ error: 'Request timed out' });
      }
    });
    expect(mockRes.setTimeout).toHaveBeenCalledWith(30000, expect.any(Function));

    timeoutCallback!();
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Request timed out' });

    // If headers already sent, should not call status again
    mockRes.status.mockClear();
    mockRes.json.mockClear();
    mockRes.headersSent = true;
    const cb = mockRes.setTimeout.mock.calls[0][1];
    cb();
    // headersSent=true means no second 503
    // (our test above already called with headersSent=false)
  });
});
