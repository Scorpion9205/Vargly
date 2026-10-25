import { Router } from 'express';
import { createRouter } from '../../common/http/async-router.js';
import { RbacController } from './rbac.controller.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';
import { denyStudents } from '../../common/decorators/deny-students.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';

export function createRbacRoutes(controller: RbacController): Router {
  const router = createRouter();

  router.use(authenticateMiddleware, denyStudents, requireActiveSubscription());

  router.get('/roles', controller.getRoles);
  router.get('/permissions', controller.getPermissions);
  router.post('/users/:userId/roles', requirePermission('rbac:manage'), controller.assignRole);

  return router;
}
