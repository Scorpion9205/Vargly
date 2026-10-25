import { Router } from 'express';
import { createRouter } from '../../common/http/async-router.js';
import { FeeController } from './fee.controller.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';

export function createFeeRoutes(controller: FeeController): Router {
  const router = createRouter();

  // The parent's receipt link: public by design (parents have no login), signed, and rate limited
  router.get('/receipt/:id/:sig', rateLimit({ name: 'fee-receipt', windowSeconds: 60, max: 60 }), controller.downloadReceipt);

  router.use(authenticateMiddleware, requireActiveSubscription());

  router.post('/plans', requirePermission('fees:create'), controller.createPlan);
  router.post('/pay', requirePermission('fees:pay'), controller.pay);
  router.post('/installments/:id/waive', requirePermission('fees:waive'), controller.waive);
  router.get('/defaulters', requirePermission('fees:read'), controller.getDefaulters);
  // At most three times an hour per institute: it messages parents
  router.post(
    '/remind-overdue',
    requirePermission('fees:pay'),
    rateLimit({ name: 'fee-remind-overdue', windowSeconds: 3600, max: 3, keyGenerator: (req) => RequestContextService.getCoachingId() ?? req.ip }),
    controller.remindOverdue,
  );
  router.get('/students/:studentId', requirePermission('fees:read'), controller.getByStudent);
  router.get('/plans/:id', requirePermission('fees:read'), controller.getPlan);

  return router;
}
