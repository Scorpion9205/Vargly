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
      studentId: null,
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
  public async findCoachingByCode(code: string) {
    return code === 'sharma' ? { id: 'c1', name: 'Sharma Classes' } : null;
  }
  public async hasRecentFromPhone(_coachingId: string, phone: string, _since: Date) {
    return [...this.rows.values()].some((row) => row.phone === phone);
  }
  public async summary(_today?: string) {
    return { total: this.rows.size, byStatus: { NEW: this.rows.size, CONTACTED: 0, ADMITTED: 0, NOT_INTERESTED: 0 }, dueToday: 0 };
  }
}

describe('EnquiryService', () => {
  let repo: InMemoryEnquiryRepository;
  let service: EnquiryService;
  const calls: string[] = [];
  const events: Array<{ eventName: string; payload: any }> = [];
  const admission = {
    students: { enrollStudent: async (dto: any) => (calls.push(`student:${dto.firstName} ${dto.lastName}`), { id: 'stu-1' } as any) },
    parents: { createParent: async (dto: any) => (calls.push(`parent:${dto.name}:${dto.phone}:${dto.studentId}`), {} as any) },
    batches: { enrollStudent: async (batchId: string, dto: any) => void calls.push(`batch:${batchId}:${dto.studentId}`) },
  };

  beforeEach(() => {
    calls.length = 0;
    repo = new InMemoryEnquiryRepository();
    events.length = 0;
    service = new EnquiryService(repo, admission as any, { publish: async (event: any) => void events.push(event) } as any);
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

  it('turns an enquiry into a student with the parent linked, in a batch, and marks it admitted', async () => {
    const created = await service.create(input(), 'c1', 'u1');
    const admitted = await service.admit(
      created.id,
      { firstName: 'Riya', lastName: 'Verma', relation: 'MOTHER', batchId: '11111111-1111-4111-8111-111111111111' },
      'c1',
      'u1',
    );
    expect(calls).toEqual([
      'student:Riya Verma',
      'parent:Mrs Verma:9876543210:stu-1',
      'batch:11111111-1111-4111-8111-111111111111:stu-1',
    ]);
    expect(admitted).toMatchObject({ status: 'ADMITTED', studentId: 'stu-1', followUpOn: null });
  });

  it('does not admit the same enquiry twice', async () => {
    const created = await service.create(input(), 'c1', 'u1');
    await service.admit(created.id, { firstName: 'Riya', lastName: 'Verma', relation: 'GUARDIAN' }, 'c1');
    await expect(
      service.admit(created.id, { firstName: 'Riya', lastName: 'Verma', relation: 'GUARDIAN' }, 'c1'),
    ).rejects.toMatchObject({ code: 'ALREADY_ADMITTED' });
    expect(calls.filter((c) => c.startsWith('student:'))).toHaveLength(1);
  });

  describe('the public enquiry page', () => {
    const form = () => ({ name: 'Mrs Verma', phone: '9876543210', studentName: 'Riya', interestedIn: 'Class 10', message: 'Fees?' });

    it('saves the enquiry as an online one and tells the owner', async () => {
      expect(await service.receiveOnline('sharma', form())).toBe(true);
      const [saved] = [...repo.rows.values()];
      expect(saved).toMatchObject({ source: 'ONLINE_FORM', status: 'NEW', notes: 'Fees?', coachingId: 'c1' });
      expect(events.map((e) => e.eventName)).toEqual(['EnquiryReceived']);
      expect(events[0]!.payload).toMatchObject({ coachingId: 'c1', name: 'Mrs Verma', phone: '9876543210' });
    });

    it('does not alert the owner twice for the same number', async () => {
      await service.receiveOnline('sharma', form());
      expect(await service.receiveOnline('sharma', form())).toBe(true);
      expect(repo.rows.size).toBe(1);
      expect(events).toHaveLength(1);
    });

    it('knows no institute by an unknown code', async () => {
      expect(await service.receiveOnline('nobody', form())).toBe(false);
      expect(await service.publicInstitute('nobody')).toBeNull();
      expect(await service.publicInstitute('sharma')).toEqual({ name: 'Sharma Classes' });
      expect(events).toHaveLength(0);
    });
  });
});
