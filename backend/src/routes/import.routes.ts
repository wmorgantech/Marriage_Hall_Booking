import express, { Router } from 'express';
import { z } from 'zod';
import { auth, requireRole } from '../middleware/auth';
import { invalidateHallPaths } from '../lib/hallUrl';
import {
  MAX_FILE_BYTES, MAX_ROWS, buildReport, buildTemplate, commitImport, validateImport,
} from '../lib/bulkImport';

const router = Router();
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Bulk import is SuperAdmin-only (stricter than the rest of /api/admin).
router.use(auth, requireRole('SUPERADMIN'));

// The .xlsx is sent as the raw request body (no multipart dependency); size is capped here.
const rawFile = express.raw({ type: [XLSX, 'application/octet-stream'], limit: MAX_FILE_BYTES });

router.get('/template', async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', 'attachment; filename="hall-import-template.xlsx"');
    res.send(await buildTemplate());
  } catch (e) { next(e); }
});

// Validate only — nothing is written.
router.post('/preview', rawFile, async (req, res, next) => {
  try {
    const { results, summary } = await validateImport(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    res.json({ results, summary });
  } catch (e) { next(e); }
});

// Re-validates the same file server-side, then saves the valid rows in one transaction.
router.post('/commit', rawFile, async (req, res, next) => {
  try {
    const out = await commitImport(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), { id: req.user!.sub });
    invalidateHallPaths();
    res.json(out);
  } catch (e) { next(e); }
});

const reportSchema = z.object({
  results: z.array(z.object({
    sheet: z.enum(['Areas', 'Halls']),
    row: z.number().int(),
    label: z.string().max(200),
    city: z.string().max(200),
    area: z.string().max(200),
    ownerPhone: z.string().max(50),
    status: z.enum(['valid', 'duplicate', 'error']),
    messages: z.array(z.string().max(500)).max(40),
    saved: z.boolean().optional(),
  })).max(MAX_ROWS),
});

router.post('/report', async (req, res, next) => {
  try {
    const { results } = reportSchema.parse(req.body);
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', 'attachment; filename="hall-import-report.xlsx"');
    res.send(await buildReport(results));
  } catch (e) { next(e); }
});

export default router;
