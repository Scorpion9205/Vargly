import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { todayInIndia } from '../reports/report.dates.js';
import { markStaffSchema, StaffAttendanceService, staffMonthSchema } from './staff-attendance.service.js';
import { z } from 'zod';

const daySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export class StaffAttendanceModule {
  public static init(): { router: Router; service: StaffAttendanceService } {
    const service = new StaffAttendanceService();
    const router = createRouter();
    router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('staff_attendance:manage'));

    router.get('/', async (req, res) => {
      const { date } = daySchema.parse(req.query);
      res.status(StatusCodes.OK).json({ data: await service.forDay(date ?? todayInIndia()) });
    });
    router.put('/', async (req, res) => {
      const result = await service.mark(markStaffSchema.parse(req.body), RequestContextService.getUserId());
      res.status(StatusCodes.OK).json({ data: result });
    });
    router.get('/month', async (req, res) => {
      const { month } = staffMonthSchema.parse(req.query);
      res.status(StatusCodes.OK).json({ data: await service.month(month) });
    });

    return { router, service };
  }
}
