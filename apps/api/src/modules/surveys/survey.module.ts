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
import { answerSchema, createSurveySchema, SurveyService } from './survey.service.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

function paramId(id: string): string {
  if (!isUuid(id)) throw new AppError('VALIDATION_ERROR', 'Invalid id', StatusCodes.BAD_REQUEST);
  return id;
}

function paramToken(token: string): string {
  if (!TOKEN_PATTERN.test(token)) throw new AppError('LINK_NOT_FOUND', 'This link is not valid any more', StatusCodes.NOT_FOUND);
  return token;
}

export class SurveyModule {
  public static init(): { router: Router; publicRouter: Router; service: SurveyService } {
    const service = new SurveyService();

    const router = createRouter();
    router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('surveys:manage'));
    router.get('/', async (_req, res) => {
      res.status(StatusCodes.OK).json({ data: await service.list() });
    });
    // It messages every parent, so it is limited to a few a day per institute
    router.post(
      '/',
      rateLimit({ name: 'survey-create', windowSeconds: 86_400, max: 5, keyGenerator: (req) => RequestContextService.getCoachingId() ?? req.ip }),
      async (req, res) => {
        const survey = await service.create(
          createSurveySchema.parse(req.body),
          RequestContextService.getRequiredCoachingId(),
          RequestContextService.getUserId(),
        );
        res.status(StatusCodes.CREATED).json({ data: survey });
      },
    );
    router.get('/:id', async (req, res) => {
      res.status(StatusCodes.OK).json({ data: await service.detail(paramId(req.params.id)) });
    });
    router.post('/:id/close', async (req, res) => {
      await service.close(paramId(req.params.id));
      res.status(StatusCodes.OK).json({ data: { message: 'Survey closed' } });
    });

    // The parent's link: public by design (parents have no login), so it is rate limited and the token is long and random
    const publicRouter = createRouter();
    publicRouter.get('/:token', rateLimit({ name: 'survey-page', windowSeconds: 60, max: 60 }), async (req, res) => {
      const survey = await service.publicSurvey(paramToken(req.params.token));
      if (!survey) throw new AppError('LINK_NOT_FOUND', 'This link is not valid any more', StatusCodes.NOT_FOUND);
      res.status(StatusCodes.OK).json({ data: survey });
    });
    publicRouter.post('/:token', rateLimit({ name: 'survey-answer', windowSeconds: 3600, max: 20 }), async (req, res) => {
      await service.submit(paramToken(req.params.token), answerSchema.parse(req.body));
      res.status(StatusCodes.CREATED).json({ data: { received: true } });
    });

    return { router, publicRouter, service };
  }
}
