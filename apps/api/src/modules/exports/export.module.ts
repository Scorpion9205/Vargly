import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import type { ReportService } from '../reports/report.service.js';
import type { StaffAttendanceService } from '../staff-attendance/staff-attendance.service.js';
import { EXPORT_KINDS, ExportKind, ExportService } from './export.service.js';
import { XLSX_CONTENT_TYPE } from './xlsx-helpers.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const exportQuerySchema = z
  .object({
    status: z.string().max(20).optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM').optional(),
    batchId: z.string().uuid().optional(),
    startDate: day.optional(),
    endDate: day.optional(),
    threshold: z.coerce.number().min(0).max(100).optional(),
  })
  .refine((q) => !q.startDate || !q.endDate || q.startDate <= q.endDate, { message: 'startDate must not be after endDate', path: ['endDate'] });

export interface ExportModuleDeps {
  readonly reports: Pick<ReportService, 'generateFeeReport' | 'generateAttendanceReport' | 'generateProfitLossReport'>;
  readonly staff: Pick<StaffAttendanceService, 'month'>;
}

export class ExportModule {
  public static init(deps: ExportModuleDeps): { router: Router; service: ExportService } {
    const service = new ExportService(undefined, deps.reports, deps.staff);
    const router = createRouter();
    router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('exports:read'));

    // Building a workbook reads a lot of rows, so it is limited per institute
    router.get(
      '/:kind',
      rateLimit({ name: 'export-xlsx', windowSeconds: 60, max: 20, keyGenerator: (req) => RequestContextService.getCoachingId() ?? req.ip }),
      async (req, res) => {
        const kind = req.params.kind as ExportKind;
        if (!(EXPORT_KINDS as readonly string[]).includes(kind)) {
          throw new AppError('EXPORT_NOT_FOUND', 'There is no such export', StatusCodes.NOT_FOUND);
        }
        const file = await service.build(
          kind,
          exportQuerySchema.parse(req.query),
          RequestContextService.getRequiredCoachingId(),
          RequestContextService.getUserId(),
        );
        res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
        res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(StatusCodes.OK).send(file.buffer);
      },
    );

    return { router, service };
  }
}
