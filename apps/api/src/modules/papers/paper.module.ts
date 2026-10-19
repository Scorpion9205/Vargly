import { Router } from 'express';
import { IEventBus } from '../../events/event-bus.interface.js';
import { eventBus } from '../../events/event-bus.js';
import { IStorageService } from '../../common/storage/storage.interface.js';
import type { AiService } from '../ai/ai.service.js';
import { PrismaPaperRepository } from './paper.repository.js';
import { PaperService, HomeworkCreator } from './paper.service.js';
import { PaperController } from './paper.controller.js';
import { createPaperRoutes } from './paper.routes.js';
import { QuestionGenerator } from './question-generator.js';

export interface PaperModuleDeps {
  readonly aiService: AiService;
  readonly homeworkService: HomeworkCreator;
  readonly storageService: IStorageService;
  readonly events?: IEventBus;
}

export class PaperModule {
  public static init(deps: PaperModuleDeps): { router: Router; service: PaperService } {
    const service = new PaperService(
      new PrismaPaperRepository(),
      new QuestionGenerator(deps.aiService),
      deps.homeworkService,
      deps.events ?? eventBus,
      deps.storageService,
    );
    return { router: createPaperRoutes(new PaperController(service)), service };
  }
}
