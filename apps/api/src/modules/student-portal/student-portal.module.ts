import { NextFunction, Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { RoleType } from '@vargly/types';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { isUuid } from '../../common/validation/is-uuid.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { PrismaStudentPortalRepository, IStudentPortalRepository, PortalStudent } from './student-portal.repository.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { requireFeature } from '../../common/decorators/require-feature.decorator.js';
import { doubtSchema, StudentDoubtService } from './student-doubt.service.js';
import { attendanceQuerySchema, homeworkDoneSchema, StudentPortalService } from './student-portal.service.js';

/**
 * Lets a signed-in student through, and tells the route which student they are. It checks the
 * role, not just the permission: every institute owner holds all permissions, so a permission
 * check alone would let owners into routes made for students. The student is found from the
 * signed-in user, never from anything the caller sends, so nobody can ask for another's records.
 */
export function requireStudent(repository: Pick<IStudentPortalRepository, 'findStudentByUserId' | 'portalSettings'>) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!RequestContextService.getRoles().includes(RoleType.STUDENT)) {
      throw new AppError('FORBIDDEN', 'This is only for students', StatusCodes.FORBIDDEN);
    }
    const userId = RequestContextService.getUserId();
    const student = userId ? await repository.findStudentByUserId(userId) : null;
    if (!student) throw new AppError('FORBIDDEN', 'No student record is linked to this login', StatusCodes.FORBIDDEN);
    if (!(await repository.portalSettings()).enabled) {
      throw new AppError('PORTAL_DISABLED', 'The student panel is switched off for your institute', StatusCodes.FORBIDDEN);
    }
    res.locals.student = student satisfies PortalStudent;
    next();
  };
}

const studentOf = (res: Response): PortalStudent => res.locals.student as PortalStudent;

export class StudentPortalModule {
  public static init(options: { doubts?: StudentDoubtService } = {}): { router: Router; service: StudentPortalService } {
    const repository = new PrismaStudentPortalRepository();
    const service = new StudentPortalService(repository);
    const router = createRouter();
    router.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'private, no-store');
      next();
    });
    router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('portal:student'), requireStudent(repository));

    const ok = (res: Response, data: unknown) => res.status(StatusCodes.OK).json({ data });

    router.get('/overview', async (_req, res) => ok(res, await service.overview(studentOf(res))));
    router.get('/profile', async (_req, res) => ok(res, await service.profile(studentOf(res))));
    router.get('/schedule', async (_req, res) => ok(res, await service.schedule(studentOf(res))));
    router.get('/attendance', async (req, res) => {
      const { month } = attendanceQuerySchema.parse(req.query);
      ok(res, await service.attendance(studentOf(res), month));
    });
    router.get('/homework', async (_req, res) => ok(res, await service.homework(studentOf(res))));
    router.put('/homework/:id/done', async (req, res) => {
      if (!isUuid(req.params.id)) throw new AppError('VALIDATION_ERROR', 'Invalid homework id', StatusCodes.BAD_REQUEST);
      await service.markHomework(studentOf(res), req.params.id, homeworkDoneSchema.parse(req.body).done);
      ok(res, { message: 'Saved' });
    });
    router.get('/results', async (_req, res) => ok(res, await service.results(studentOf(res))));
    router.get('/materials', async (_req, res) => ok(res, await service.materials(studentOf(res))));
    router.get('/notices', async (_req, res) => ok(res, await service.notices(studentOf(res))));
    router.get('/fees', async (_req, res) => ok(res, await service.fees(studentOf(res))));

    // The AI doubt solver: switched on by the owner, paid by the institute's credits, limited per student
    const doubts = options.doubts;
    if (doubts) {
      router.post(
        '/doubts',
        async (_req, _res, next) => {
          if (!(await repository.portalSettings()).doubts) {
            throw new AppError('DOUBTS_OFF', 'Doubt help is not switched on for your institute', StatusCodes.FORBIDDEN);
          }
          next();
        },
        requireFeature('ai.doubts'),
        rateLimit({ name: 'student-doubts', windowSeconds: 86400, max: 20, keyGenerator: () => RequestContextService.getUserId() }),
        async (req, res) => {
          const student = studentOf(res);
          const subjects = (await repository.batchesOf(student.id)).map((b) => b.subject).filter((s): s is string => !!s);
          ok(res, await doubts.ask(student, doubtSchema.parse(req.body), RequestContextService.getUserId(), subjects));
        },
      );
    }

    return { router, service };
  }
}
