import { StatusCodes } from 'http-status-codes';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import type { StudentService } from '../students/student.service.js';
import type { ParentService } from '../parents/parent.service.js';
import type { BatchService } from '../batches/batch.service.js';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { eventBus as defaultEventBus } from '../../events/event-bus.js';
import { IEnquiryRepository } from './enquiry.repository.js';
import { createEnquiryReceivedEvent } from './enquiry.events.js';
import {
  AdmitEnquiryDto,
  CreateEnquiryDto,
  EnquiryRecord,
  PublicEnquiryDto,
  EnquirySummary,
  ListEnquiryQuery,
  UpdateEnquiryDto,
} from './enquiry.types.js';

/** Today in India as YYYY-MM-DD: follow-up days are the owner's local days */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The parts of the student, parent and batch services that admitting an enquiry uses */
export interface AdmissionDeps {
  readonly students: Pick<StudentService, 'enrollStudent'>;
  readonly parents: Pick<ParentService, 'createParent'>;
  readonly batches: Pick<BatchService, 'enrollStudent'>;
}

export class EnquiryService {
  public constructor(
    private readonly repository: IEnquiryRepository,
    private readonly admission?: AdmissionDeps,
    private readonly events: IEventBus = defaultEventBus,
  ) {}

  /** The name shown at the top of the public enquiry page; null when the code is not an institute */
  public async publicInstitute(code: string): Promise<{ name: string } | null> {
    const coaching = await this.repository.findCoachingByCode(code);
    return coaching ? { name: coaching.name } : null;
  }

  /**
   * An enquiry from the institute's public page. A repeat from the same number within a day is
   * treated as done (a double tap), so the owner is not alerted twice.
   */
  public async receiveOnline(code: string, dto: PublicEnquiryDto): Promise<boolean> {
    const coaching = await this.repository.findCoachingByCode(code);
    if (!coaching) return false;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (await this.repository.hasRecentFromPhone(coaching.id, dto.phone, since)) return true;

    const enquiry = await RequestContextService.runForTenant(coaching.id, () =>
      this.repository.create({
        coachingId: coaching.id,
        name: dto.name,
        phone: dto.phone,
        studentName: dto.studentName ?? null,
        interestedIn: dto.interestedIn ?? null,
        source: 'ONLINE_FORM',
        notes: dto.message ?? null,
      }),
    );
    await this.events.publish(
      createEnquiryReceivedEvent({
        coachingId: coaching.id,
        enquiryId: enquiry.id,
        name: enquiry.name,
        phone: enquiry.phone,
        interestedIn: enquiry.interestedIn,
      }),
    );
    return true;
  }

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

  /**
   * Turns an enquiry into a student: the student, the parent (the person who enquired, with the
   * number they gave), the batch if one is chosen, and the enquiry marked as admitted.
   */
  public async admit(id: string, dto: AdmitEnquiryDto, coachingId: string, userId?: string): Promise<EnquiryRecord> {
    if (!this.admission) throw new AppError('NOT_AVAILABLE', 'Admission is not set up', StatusCodes.NOT_IMPLEMENTED);
    const enquiry = await this.get(id);
    if (enquiry.studentId) {
      throw new AppError('ALREADY_ADMITTED', 'This enquiry has already become a student', StatusCodes.CONFLICT);
    }
    const student = await this.admission.students.enrollStudent(
      { firstName: dto.firstName, lastName: dto.lastName },
      coachingId,
      userId,
    );
    await this.admission.parents.createParent(
      { name: enquiry.name, phone: enquiry.phone, relation: dto.relation, studentId: student.id, isPrimary: true },
      coachingId,
      userId,
    );
    if (dto.batchId) {
      await this.admission.batches.enrollStudent(dto.batchId, { studentId: student.id }, coachingId, userId);
    }
    return this.repository.update(id, {
      status: 'ADMITTED',
      studentId: student.id,
      lastContactedAt: new Date(),
      followUpOn: null,
    });
  }

  public async remove(id: string): Promise<void> {
    await this.get(id);
    await this.repository.softDelete(id);
  }
}
