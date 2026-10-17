import { Router } from 'express';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { requireFeature, requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { requireBatchAccess } from '../../common/decorators/require-batch-access.decorator.js';
import { PaperController } from './paper.controller.js';

export function createPaperRoutes(controller: PaperController): Router {
  const router = createRouter();

  // The parents' link. Public by design (parents have no login), so it is rate limited and the
  // token is long and random; it is registered before authentication.
  router.get(
    '/dl/:token',
    rateLimit({ name: 'papers-download', windowSeconds: 60, max: 60 }),
    controller.download,
  );

  router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('papers:manage'));

  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.get('/:id/shares', controller.shares);
  router.get('/:id/pdf', controller.pdf);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/duplicate', controller.duplicate);

  // Generating costs AI credits and needs the plan's AI papers feature; sharing a paper of your own
  // (an uploaded PDF) does not
  router.post('/generate', requireFeature('ai.papers'), controller.generate);
  router.post('/:id/questions', requireFeature('ai.papers'), controller.addQuestions);
  router.post('/:id/questions/:questionId/regenerate', requireFeature('ai.papers'), controller.regenerateQuestion);

  router.post('/upload', controller.upload);
  // Teachers may share only with batches they teach
  router.post('/:id/publish', requireBatchAccess({ resource: 'batch', source: 'body', key: 'batchId' }), controller.publish);

  return router;
}
