import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { isUuid } from '../../common/validation/is-uuid.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { EnquiryService } from './enquiry.service.js';
import { createEnquirySchema, listEnquirySchema, updateEnquirySchema } from './enquiry.types.js';

function paramId(req: Request): string {
  if (!isUuid(req.params.id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid enquiry id', StatusCodes.BAD_REQUEST);
  }
  return req.params.id;
}

export class EnquiryController {
  public constructor(private readonly service: EnquiryService) {}

  public create = async (req: Request, res: Response): Promise<void> => {
    const enquiry = await this.service.create(
      createEnquirySchema.parse(req.body),
      RequestContextService.getRequiredCoachingId(),
      RequestContextService.getUserId(),
    );
    res.status(StatusCodes.CREATED).json({ data: enquiry });
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    res.status(StatusCodes.OK).json({ data: await this.service.list(listEnquirySchema.parse(req.query)) });
  };

  public summary = async (_req: Request, res: Response): Promise<void> => {
    res.status(StatusCodes.OK).json({ data: await this.service.summary() });
  };

  public get = async (req: Request, res: Response): Promise<void> => {
    res.status(StatusCodes.OK).json({ data: await this.service.get(paramId(req)) });
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const enquiry = await this.service.update(paramId(req), updateEnquirySchema.parse(req.body));
    res.status(StatusCodes.OK).json({ data: enquiry });
  };

  public remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(paramId(req));
    res.status(StatusCodes.OK).json({ data: { message: 'Enquiry deleted' } });
  };
}
