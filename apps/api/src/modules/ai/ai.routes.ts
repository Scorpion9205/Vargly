import { Router } from 'express';
import { denyStudents } from '../../common/decorators/deny-students.decorator.js';
import { createRouter } from '../../common/http/async-router.js';
import { AiController } from './ai.controller.js';
import { authenticateMiddleware } from '../../common/middleware/auth.middleware.js';
import { requireFeature } from '../../common/decorators/require-feature.decorator.js';
import { requirePermission } from '../../common/decorators/require-permission.decorator.js';
import { requireBatchAccess } from '../../common/decorators/require-batch-access.decorator.js';

export function createAiRouter(controller: AiController): Router {
  const router = createRouter();

  // All AI routes require authentication and feature entitlement
  router.use(authenticateMiddleware);
  router.use(requireFeature('ai.insights'));

  // Credit & Wallet Management
  router.get('/wallet', denyStudents, controller.getWalletBalance);
  // Credits are bought through POST /api/v1/billing/orders and granted by the payment webhook
  router.get('/usage-logs', requirePermission('ai:view_logs'), controller.getUsageLogs);

  // AI Generation Endpoints
  router.post('/completion', requirePermission('ai:generate'), controller.generateCompletion);
  router.post(
    '/student-narrative',
    requirePermission('ai:generate'),
    requireBatchAccess({ resource: 'student', source: 'body', key: 'studentId' }),
    controller.generateStudentNarrative,
  );
  router.post(
    '/parent-report-card',
    requirePermission('ai:generate'),
    requireBatchAccess({ resource: 'student', source: 'body', key: 'studentId' }),
    controller.generateParentReportCard,
  );
  router.post(
    '/teacher-insight',
    requirePermission('ai:generate'),
    requireBatchAccess({ resource: 'teacher', source: 'body', key: 'teacherId' }),
    controller.generateTeacherInsight,
  );

  return router;
}
