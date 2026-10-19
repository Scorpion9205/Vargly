import { Router } from 'express';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireSuperAdmin } from '../../common/decorators/require-super-admin.decorator.js';
import { OpsController } from './ops.controller.js';

/** Vargly's own operations console. Platform administrators only; institutes never reach it. */
export function createOpsRoutes(controller: OpsController): Router {
  const router = createRouter();
  router.use(authenticateMiddleware, requireSuperAdmin);

  router.get('/summary', controller.summary);
  router.get('/events', controller.listEvents);
  router.post('/events/:id/retry', controller.retryEvent);
  router.get('/payments', controller.listPayments);
  router.post('/payments/:id/resolve', controller.resolvePayment);

  return router;
}
