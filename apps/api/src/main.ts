import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { StatusCodes } from 'http-status-codes';
import { envConfig } from './config/env.config.js';
import { logger } from './common/logger/logger.service.js';
import { tenantContextMiddleware } from './common/middleware/tenant-context.middleware.js';
import { errorHandlerMiddleware } from './common/middleware/error-handler.middleware.js';
import { metricsMiddleware, getMetricsHandler } from './common/metrics/metrics.service.js';
import { queueRegistry } from './queues/queue.registry.js';
import { getPrismaClient } from './database/prisma/tenant-prisma.extension.js';
import { assertDatabaseRoleEnforcesRls } from './database/prisma/database-role.check.js';
import { workerRegistry } from './workers/worker.registry.js';
import { initModules } from './bootstrap/modules.js';
import { reportIntegrationStatus } from './common/integrations/integration-status.js';
import { registerProcessErrorHandlers } from './common/logger/process-error-handlers.js';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', envConfig.get('TRUST_PROXY'));

  // Security & Transport
  app.use(helmet());
  app.use(
    cors({
      origin: envConfig.get('CORS_ORIGIN'),
      credentials: true,
    }),
  );
  // Keep the raw body for webhook HMAC verification
  const jsonParser = (limit: string) =>
    express.json({
      limit,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    });
  // Small default body limit; only endpoints that carry files or bulk rows accept more.
  // Registered first, these parse the body so the default parser below skips it.
  app.use('/api/v1/storage/upload', jsonParser('15mb')); // base64 of a 10 MB file
  app.use('/api/v1/import', jsonParser('10mb'));
  app.use(jsonParser('1mb'));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request Context & Multi-Tenancy
  app.use(tenantContextMiddleware);

  // Prometheus Metrics Collection
  app.use(metricsMiddleware);
  app.get('/metrics', getMetricsHandler);

  // Health Checks
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(StatusCodes.OK).json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      // 1. Check Redis
      const redis = queueRegistry.getRedisClient();
      const redisPing = await redis.ping();

      // 2. Check Database
      const prisma = getPrismaClient();
      await (prisma as any).$queryRaw`SELECT 1`;

      res.status(StatusCodes.OK).json({
        status: 'READY',
        checks: {
          database: 'UP',
          redis: redisPing === 'PONG' ? 'UP' : 'DOWN',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Readiness check failed:', err);
      res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        status: 'DOWN',
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Base API v1 placeholder
  app.get('/api/v1', (_req: Request, res: Response) => {
    res.status(StatusCodes.OK).json({
      name: 'Vargly API',
      version: '1.0.0',
      status: 'OPERATIONAL',
      docs: '/api/v1/docs',
    });
  });

  // Modules are initialised once per process (see bootstrap/modules.ts)
  const m = initModules();
  app.use('/api/v1/storage', m.storage.router);
  app.use('/api/v1/auth', m.auth.router);
  app.use('/api/v1/rbac', m.rbac.router);
  app.use('/api/v1/coachings', m.coaching.router);
  app.use('/api/v1/students', m.student.router);
  app.use('/api/v1/parents', m.parent.router);
  app.use('/api/v1/teachers', m.teacher.router);
  app.use('/api/v1/batches', m.batch.router);
  app.use('/api/v1/attendance', m.attendance.router);
  app.use('/api/v1/tests', m.test.router);
  app.use('/api/v1/homework', m.homework.router);
  app.use('/api/v1/notifications', m.notification.router);
  app.use('/api/v1/timeline', m.timeline.router);
  app.use('/api/v1/audit', m.audit.router);
  app.use('/api/v1/whatsapp-assistant', m.whatsappAssistant.router);
  app.use('/api/v1/risk-engine', m.riskEngine.router);
  app.use('/api/v1/ai', m.ai.router);
  app.use('/api/v1/fees', m.fee.router);
  app.use('/api/v1/salary', m.salary.router);
  app.use('/api/v1/expenses', m.expense.router);
  app.use('/api/v1/billing', m.billing.router);
  app.use('/api/v1/notices', m.notice.router);
  app.use('/api/v1/settings', m.settings.router);
  app.use('/api/v1/reports', m.report.router);
  app.use('/api/v1/dashboard', m.dashboard.router);
  app.use('/api/v1/import', m.import.router);
  app.use('/api/v1/admin/ops', m.ops.router);

  // Global Error Handler (must be last)
  app.use(errorHandlerMiddleware);

  return app;
}

async function startServer(): Promise<void> {
  await assertDatabaseRoleEnforcesRls(getPrismaClient());
  reportIntegrationStatus('Api');

  const app = createApp();
  const port = envConfig.get('PORT');

  // Background workers normally run in their own process (worker-runner). Running them
  // inside the API as well doubled the work and competed with requests; it remains available
  // for single-process local development (RUN_WORKERS_IN_API).
  if (envConfig.get('RUN_WORKERS_IN_API') === 'true') {
    await workerRegistry.startAll();
  }

  const server = app.listen(port, () => {
    logger.info(`🚀 Vargly API server running on port ${port} [${envConfig.get('NODE_ENV')}]`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[Server] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      try {
        await workerRegistry.closeAll();
        await queueRegistry.closeAll();
        const prisma = getPrismaClient();
        await (prisma as any).$disconnect();
        logger.info('[Server] Graceful shutdown completed.');
        process.exit(0);
      } catch (err) {
        logger.error('[Server] Error during graceful shutdown:', err);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Auto-start server if executed directly
if (process.env.NODE_ENV !== 'test') {
  registerProcessErrorHandlers('Api');
  startServer().catch((err) => {
    logger.error('Failed to start Vargly API server:', err);
    process.exit(1);
  });
}
