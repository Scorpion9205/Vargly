import { Router } from 'express';
import { PrismaEnquiryRepository } from './enquiry.repository.js';
import { AdmissionDeps, EnquiryService } from './enquiry.service.js';
import { EnquiryController } from './enquiry.controller.js';
import { createEnquiryRoutes, createPublicEnquiryRoutes } from './enquiry.routes.js';

export class EnquiryModule {
  public static init(deps?: AdmissionDeps): { router: Router; publicRouter: Router; service: EnquiryService } {
    const service = new EnquiryService(new PrismaEnquiryRepository(), deps);
    const controller = new EnquiryController(service);
    return { router: createEnquiryRoutes(controller), publicRouter: createPublicEnquiryRoutes(controller), service };
  }
}
