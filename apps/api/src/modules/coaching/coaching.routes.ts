import { Router } from 'express';
import { createRouter } from '../../common/http/async-router.js';
import { CoachingController } from './coaching.controller.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { rateLimit } from '../../common/middleware/rate-limit.middleware.js';
import { denyStudents } from '../../common/decorators/deny-students.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';

export function createCoachingRoutes(controller: CoachingController): Router {
  const router = createRouter();

  // Public: Self-serve coaching onboarding
  router.post('/register', rateLimit({ name: 'coaching-register', windowSeconds: 3600, max: 5 }), controller.register);

  // Protected: Current coaching institute profile
  // (A student has no business with the institute's contact details or its subscription)
  router.get('/me', authenticateMiddleware, denyStudents, controller.getProfile);
  // Allowed without an active subscription, like billing: the owner can always fix contact details
  router.put('/me', authenticateMiddleware, requirePermission('settings:manage'), controller.updateProfile);

  return router;
}
