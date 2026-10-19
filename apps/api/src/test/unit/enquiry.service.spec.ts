import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import {
  CreateEnquiryInput,
  EnquiryFilter,
  IEnquiryRepository,
  UpdateEnquiryInput,
} from '../../modules/enquiries/enquiry.repository.js';
import { EnquiryService, todayInIndia } from '../../modules/enquiries/enquiry.service.js';
import { createEnquirySchema, EnquiryRecord, updateEnquirySchema } from '../../modules/enquiries/enquiry.types.js';

class InMemoryEnquiryRepository implements IEnquiryRepository {
  public rows = new Map<string, EnquiryRecord>();
  public lastFilter?: EnquiryFilter;

  public async create(input: CreateEnquiryInput): Promise<EnquiryRecord> {
    const record: EnquiryRecord = {
      id: crypto.randomUUID(),
      coachingId: input.coachingId,
      name: input.name,
      phone: input.phone,
      studentName: input.studentName ?? null,
      interestedIn: input.interestedIn ?? null,
      source: input.source,
      status: 'NEW',
      notes: input.notes ?? null,
      followUpOn: input.followUpOn ?? null,
      lastContactedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(record.id, record);
    return record;
  }
  public async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  public async list(filter: EnquiryFilter) {
    this.lastFilter = filter;
    return [...this.rows.values()];
  }
  public async update(id: string, input: UpdateEnquiryInput): Promise<EnquiryRecord> {
    const next = { ...this.rows.get(id)!, ...input } as EnquiryRecord;
    this.rows.set(id, next);
    return next;
  }
  public async softDelete(id: string) {
    this.rows.delete(id);
  }
  public async summary(_today?: string) {
    return { total: this.rows.size, byStatus: { NEW: this.rows.size, CONTACTED: 0, ADMITTED: 0, NOT_INTERESTED: 0 }, dueToday: 0 };
  }
}

describe('EnquiryService', () => {
  let repo: InMemoryEnquiryRepository;
  let service: EnquiryService;

  beforeEach(() => {
    repo = new InMemoryEnquiryRepository();
    service = new EnquiryService(repo);
  });

  const input = () => createEnquirySchema.parse({ name: 'Mrs Verma', phone: '98765 43210', followUpOn: '2026-10-25' });

  it('cleans the phone number people type', () => {
    expect(input().phone).toBe('9876543210');
    expect(() => createEnquirySchema.parse({ name: 'Mrs Verma', phone: '12345' })).toThrow();
  });

  it('marks the time of the call when an enquiry moves on from new', async () => {
    const created = await service.create(input(), 'c1', 'u1');
    const contacted = await service.update(created.id, { status: 'CONTACTED' });
    expect(contacted.lastContactedAt).toBeInstanceOf(Date);
    expect(contacted.followUpOn).toBe('2026-10-25');
  });

  it('clears the follow-up when the enquiry is closed, unless a day is given', async () => {
    const created = await service.create(input(), 'c1', 'u1');
    expect((await service.update(created.id, { status: 'ADMITTED' })).followUpOn).toBeNull();
    const other = await service.create(input(), 'c1', 'u1');
    expect((await service.update(other.id, { status: 'NOT_INTERESTED', followUpOn: '2027-01-01' })).followUpOn).toBe('2027-01-01');
  });

  it('refuses an empty update and an unknown enquiry', async () => {
    expect(() => updateEnquirySchema.parse({})).toThrow();
    await expect(service.get('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('asks only for what is due when listing the follow-ups of the day', async () => {
    await service.list({ due: 'true', limit: 50 });
    expect(repo.lastFilter?.dueBy).toBe(todayInIndia());
  });

  it('counts the day in India: just after 18:30 UTC it is already tomorrow', () => {
    expect(todayInIndia(new Date('2026-10-19T18:45:00Z'))).toBe('2026-10-20');
    expect(todayInIndia(new Date('2026-10-19T18:15:00Z'))).toBe('2026-10-19');
  });
});
