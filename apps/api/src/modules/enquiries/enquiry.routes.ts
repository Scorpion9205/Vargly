import { Router } from 'express';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { EnquiryController } from './enquiry.controller.js';

export function createEnquiryRoutes(controller: EnquiryController): Router {
  const router = createRouter();
  router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('enquiries:manage'));

  router.get('/', controller.list);
  router.get('/summary', controller.summary);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.post('/:id/admit', controller.admit);
  router.delete('/:id', controller.remove);

  return router;
}

/**
 * The institute's public enquiry page. No login (parents have none), so it is rate limited, has a
 * hidden field for bots, and shows nothing but the institute's name.
 */
export function createPublicEnquiryRoutes(controller: EnquiryController): Router {
  const router = createRouter();
  router.get('/:code', rateLimit({ name: 'enquiry-page', windowSeconds: 60, max: 60 }), controller.publicPage);
  router.post('/:code', rateLimit({ name: 'enquiry-submit', windowSeconds: 3600, max: 8 }), controller.publicSubmit);
  return router;
}
