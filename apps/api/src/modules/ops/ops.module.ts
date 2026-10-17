import { Router } from 'express';
import { PrismaOpsRepository } from './ops.repository.js';
import { OpsService } from './ops.service.js';
import { OpsController } from './ops.controller.js';
import { createOpsRoutes } from './ops.routes.js';

export class OpsModule {
  public static init(): { router: Router; service: OpsService } {
    const service = new OpsService(new PrismaOpsRepository());
    return { router: createOpsRoutes(new OpsController(service)), service };
  }
}
