import { Router } from 'express';
import { createRouter } from '../../common/http/async-router.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { EnquiryController } from './enquiry.controller.js';

export function createEnquiryRoutes(controller: EnquiryController): Router {
  const router = createRouter();
  router.use(authenticateMiddleware, requireActiveSubscription(), requirePermission('enquiries:manage'));

  router.get('/', controller.list);
  router.get('/summary', controller.summary);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);

  return router;
}
