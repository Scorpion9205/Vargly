import { Router } from 'express';
import { PrismaEnquiryRepository } from './enquiry.repository.js';
import { EnquiryService } from './enquiry.service.js';
import { EnquiryController } from './enquiry.controller.js';
import { createEnquiryRoutes } from './enquiry.routes.js';

export class EnquiryModule {
  public static init(): { router: Router; service: EnquiryService } {
    const service = new EnquiryService(new PrismaEnquiryRepository());
    return { router: createEnquiryRoutes(new EnquiryController(service)), service };
  }
}
