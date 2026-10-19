import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { IEnquiryRepository } from './enquiry.repository.js';
import {
  CreateEnquiryDto,
  EnquiryRecord,
  EnquirySummary,
  ListEnquiryQuery,
  UpdateEnquiryDto,
} from './enquiry.types.js';

/** Today in India as YYYY-MM-DD: follow-up days are the owner's local days */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export class EnquiryService {
  public constructor(private readonly repository: IEnquiryRepository) {}

  public async create(dto: CreateEnquiryDto, coachingId: string, userId?: string): Promise<EnquiryRecord> {
    return this.repository.create({ ...dto, coachingId, createdBy: userId });
  }

  public async list(query: ListEnquiryQuery): Promise<EnquiryRecord[]> {
    return this.repository.list({
      status: query.status,
      dueBy: query.due === 'true' ? todayInIndia() : undefined,
      search: query.search,
      limit: query.limit,
    });
  }

  public async summary(): Promise<EnquirySummary> {
    return this.repository.summary(todayInIndia());
  }

  public async get(id: string): Promise<EnquiryRecord> {
    const enquiry = await this.repository.findById(id);
    if (!enquiry) throw new AppError('ENQUIRY_NOT_FOUND', 'Enquiry not found', StatusCodes.NOT_FOUND);
    return enquiry;
  }

  public async update(id: string, dto: UpdateEnquiryDto): Promise<EnquiryRecord> {
    const current = await this.get(id);
    const status = dto.status ?? current.status;
    const closed = status === 'ADMITTED' || status === 'NOT_INTERESTED';
    const movedOn = dto.status !== undefined && dto.status !== 'NEW' && dto.status !== current.status;
    return this.repository.update(id, {
      ...dto,
      // Moving an enquiry out of "new" means the owner has spoken to them
      ...(movedOn ? { lastContactedAt: new Date() } : {}),
      // A closed enquiry (admitted or not interested) has nothing left to follow up
      ...(closed && dto.followUpOn === undefined ? { followUpOn: null } : {}),
    });
  }

  public async remove(id: string): Promise<void> {
    await this.get(id);
    await this.repository.softDelete(id);
  }
}
