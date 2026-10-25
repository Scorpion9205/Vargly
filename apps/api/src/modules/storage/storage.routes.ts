import { Router } from 'express';
import { createRouter } from '../../common/http/async-router.js';
import { StorageController } from './storage.controller.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { denyStudents } from '../../common/decorators/deny-students.decorator.js';
import { requireActiveSubscription } from '../../common/decorators/require-feature.decorator.js';

export function createStorageRoutes(controller: StorageController): Router {
  const router = createRouter();

  // Public/direct download for mock storage in development
  router.get('/files/*', controller.serveFile);

  // Authenticated storage operations
  router.post(
    '/presigned-url',
    authenticateMiddleware,
    denyStudents,
    requireActiveSubscription(),
    controller.getPresignedUrl,
  );
  router.post(
    '/upload',
    authenticateMiddleware,
    denyStudents,
    requireActiveSubscription(),
    controller.directUpload,
  );

  return router;
}
