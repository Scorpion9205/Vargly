import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { RoleType } from '@vargly/types';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { isUuid } from '../../common/validation/is-uuid.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { PaperService } from './paper.service.js';
import {
  PaperActor,
  addQuestionsSchema,
  generatePaperSchema,
  publishPaperSchema,
  regenerateQuestionSchema,
  updatePaperSchema,
  uploadPaperSchema,
} from './paper.types.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

/** `attachment` makes the browser download the file instead of showing it in the page */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function paramId(req: Request): string {
  if (!isUuid(req.params.id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid paper id', StatusCodes.BAD_REQUEST);
  }
  return req.params.id;
}

export class PaperController {
  public constructor(private readonly service: PaperService) {}

  private actor(): PaperActor {
    const roles = RequestContextService.getRoles();
    return {
      userId: RequestContextService.getUserId(),
      canSeeAll: roles.includes(RoleType.OWNER) || roles.includes(RoleType.SUPER_ADMIN),
    };
  }

  public list = async (_req: Request, res: Response): Promise<void> => {
    res.status(StatusCodes.OK).json({ data: await this.service.list(this.actor()) });
  };

  public get = async (req: Request, res: Response): Promise<void> => {
    res.status(StatusCodes.OK).json({ data: await this.service.get(paramId(req), this.actor()) });
  };

  public generate = async (req: Request, res: Response): Promise<void> => {
    const dto = generatePaperSchema.parse(req.body);
    const result = await this.service.generate(
      dto,
      RequestContextService.getRequiredCoachingId(),
      this.actor(),
      RequestContextService.getTraceId(),
    );
    res.status(StatusCodes.CREATED).json({ data: result.paper, meta: { shortBy: result.shortBy } });
  };

  public addQuestions = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.addQuestions(
      paramId(req),
      addQuestionsSchema.parse(req.body),
      RequestContextService.getRequiredCoachingId(),
      this.actor(),
      RequestContextService.getTraceId(),
    );
    res.status(StatusCodes.OK).json({ data: result.paper, meta: { shortBy: result.shortBy } });
  };

  public regenerateQuestion = async (req: Request, res: Response): Promise<void> => {
    const paper = await this.service.regenerateQuestion(
      paramId(req),
      req.params.questionId,
      regenerateQuestionSchema.parse(req.body ?? {}),
      RequestContextService.getRequiredCoachingId(),
      this.actor(),
      RequestContextService.getTraceId(),
    );
    res.status(StatusCodes.OK).json({ data: paper });
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const paper = await this.service.update(paramId(req), updatePaperSchema.parse(req.body), this.actor());
    res.status(StatusCodes.OK).json({ data: paper });
  };

  public remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(paramId(req), this.actor());
    res.status(StatusCodes.OK).json({ data: { message: 'Paper deleted' } });
  };

  public duplicate = async (req: Request, res: Response): Promise<void> => {
    const paper = await this.service.duplicate(
      paramId(req),
      RequestContextService.getRequiredCoachingId(),
      this.actor(),
    );
    res.status(StatusCodes.CREATED).json({ data: paper });
  };

  public upload = async (req: Request, res: Response): Promise<void> => {
    const paper = await this.service.upload(
      uploadPaperSchema.parse(req.body),
      RequestContextService.getRequiredCoachingId(),
      this.actor(),
    );
    res.status(StatusCodes.CREATED).json({ data: paper });
  };

  public publish = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.publish(
      paramId(req),
      publishPaperSchema.parse(req.body),
      RequestContextService.getRequiredCoachingId(),
      this.actor(),
      RequestContextService.getTraceId(),
    );
    res.status(StatusCodes.CREATED).json({ data: result });
  };

  public shares = async (req: Request, res: Response): Promise<void> => {
    res.status(StatusCodes.OK).json({ data: await this.service.shares(paramId(req), this.actor()) });
  };

  /** The teacher's PDF: a preview, or with ?answers=true the answer key */
  public pdf = async (req: Request, res: Response): Promise<void> => {
    const { pdf, fileName } = await this.service.renderForTeacher(
      paramId(req),
      req.query.answers === 'true',
      RequestContextService.getRequiredCoachingId(),
      this.actor(),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(StatusCodes.OK).send(pdf);
  };

  /** The link parents get: no login, only the token in the address */
  public download = async (req: Request, res: Response): Promise<void> => {
    if (!TOKEN_PATTERN.test(req.params.token)) {
      throw new AppError('LINK_NOT_FOUND', 'This link is not valid any more', StatusCodes.NOT_FOUND);
    }
    const result = await this.service.openShare(req.params.token);

    let body: Buffer;
    if (result.kind === 'generated') {
      body = result.pdf;
    } else {
      const upstream = await fetch(result.url);
      if (!upstream.ok) {
        throw new AppError('FILE_UNAVAILABLE', 'The paper could not be loaded right now', StatusCodes.BAD_GATEWAY);
      }
      body = Buffer.from(await upstream.arrayBuffer());
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(result.fileName));
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(StatusCodes.OK).send(body);
  };
}
