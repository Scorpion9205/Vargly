import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { isUuid } from '../../common/validation/is-uuid.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { passwordService } from '../../common/security/password.service.js';
import { permissionResolver } from '../../common/security/permission-resolver.service.js';
import { envConfig } from '../../config/env.config.js';
import { getPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { renderLoginCardsPdf } from './login-card-pdf.js';
import { z } from 'zod';
import {
  bulkLoginSchema,
  createLoginSchema,
  listLoginsSchema,
  PrismaStudentLoginRepository,
  StudentLoginService,
} from './student-login.service.js';

function paramId(id: string): string {
  if (!isUuid(id)) throw new AppError('VALIDATION_ERROR', 'Invalid student id', StatusCodes.BAD_REQUEST);
  return id;
}

const cardsSchema = z.object({
  cards: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        loginId: z.string().trim().min(3).max(60),
        temporaryPassword: z.string().min(6).max(64),
      }),
    )
    .min(1)
    .max(200),
});

export class StudentLoginModule {
  public static init(): { router: Router; service: StudentLoginService } {
    const service = new StudentLoginService(
      new PrismaStudentLoginRepository((userId) => permissionResolver.invalidate(userId)),
      passwordService,
    );
    const router = createRouter();
    // Temporary passwords pass through these responses: nothing may keep a copy
    router.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'private, no-store');
      next();
    });
    router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('student_logins:manage'));

    router.get('/', async (req, res) => {
      const { batchId } = listLoginsSchema.parse(req.query);
      res.status(StatusCodes.OK).json({ data: await service.list(batchId) });
    });
    router.post('/', async (req, res) => {
      const { studentId } = createLoginSchema.parse(req.body);
      res.status(StatusCodes.CREATED).json({ data: await service.create(studentId, RequestContextService.getUserId()) });
    });
    // Hashing a hundred passwords takes a while, so this is limited per institute
    router.post(
      '/bulk',
      rateLimit({ name: 'student-logins-bulk', windowSeconds: 3600, max: 10, keyGenerator: (req) => RequestContextService.getCoachingId() ?? req.ip }),
      async (req, res) => {
        const { batchId } = bulkLoginSchema.parse(req.body ?? {});
        res.status(StatusCodes.CREATED).json({ data: await service.createMany(batchId, RequestContextService.getUserId()) });
      },
    );
    // The cards are made from the logins the owner was just shown (the passwords are not stored), so
    // the page sends them back; nothing is kept
    router.post('/cards', async (req, res) => {
      const { cards } = cardsSchema.parse(req.body);
      const coaching = await (getPrismaClient() as any).coaching.findFirst({
        where: { id: RequestContextService.getRequiredCoachingId() },
        select: { name: true, code: true },
      });
      const pdf = await renderLoginCardsPdf({
        instituteName: coaching?.name ?? 'Vargly',
        instituteCode: coaching?.code ?? '',
        signInUrl: `${envConfig.get('FRONTEND_URL').replace(/\/+$/, '')}/login`,
        cards,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="student-login-cards.pdf"');
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(StatusCodes.OK).send(pdf);
    });
    router.get('/:studentId', async (req, res) => {
      res.status(StatusCodes.OK).json({ data: await service.status(paramId(req.params.studentId)) });
    });
    router.post('/:studentId/reset', async (req, res) => {
      res.status(StatusCodes.OK).json({ data: await service.reset(paramId(req.params.studentId), RequestContextService.getUserId()) });
    });
    router.post('/:studentId/disable', async (req, res) => {
      await service.disable(paramId(req.params.studentId), RequestContextService.getUserId());
      res.status(StatusCodes.OK).json({ data: { message: 'Login switched off' } });
    });

    return { router, service };
  }
}
