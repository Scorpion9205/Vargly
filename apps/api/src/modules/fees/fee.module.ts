import { Router } from 'express';
import { PrismaFeeRepository } from './fee.repository.js';
import { FeeService } from './fee.service.js';
import { FeeController } from './fee.controller.js';
import { createFeeRoutes } from './fee.routes.js';
import { eventBus } from '../../events/event-bus.js';
import { FeeSubscribers } from './fee.subscribers.js';
import { FeeReminderScheduler } from './fee.cron.js';
import { FeeReceiptService } from './fee-receipt.service.js';
import { OverdueReminderService } from './fee-overdue-reminder.service.js';

export class FeeModule {
  public static init(): {
    router: Router;
    service: FeeService;
    scheduler: FeeReminderScheduler;
  } {
    const repository = new PrismaFeeRepository();
    const service = new FeeService(repository, eventBus);
    const controller = new FeeController(service, new FeeReceiptService(), new OverdueReminderService());
    const router = createFeeRoutes(controller);
    const scheduler = new FeeReminderScheduler(repository, eventBus);

    FeeSubscribers.register(eventBus);

    return { router, service, scheduler };
  }
}
