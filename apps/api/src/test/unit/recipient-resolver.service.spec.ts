import { describe, it, expect } from 'vitest';
import { RecipientResolverService } from '../../modules/notifications/services/recipient-resolver.service.js';

describe('RecipientResolverService Unit Tests', () => {
  it('should resolve direct phone numbers directly', async () => {
    const resolver = new RecipientResolverService({} as any);
    const result = await resolver.resolveRecipients('+919876543210', 'test-coaching-id');

    expect(result).toHaveLength(1);
    expect(result[0].phone).toBe('+919876543210');
    expect(result[0].recipientType).toBe('PARENT');
  });

  it('should resolve direct emails directly', async () => {
    const resolver = new RecipientResolverService({} as any);
    const result = await resolver.resolveRecipients('parent@example.com', 'test-coaching-id');

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('parent@example.com');
  });

  it('should resolve student parent contact from database', async () => {
    const mockPrisma = {
      student: {
        findFirst: async () => ({
          id: 'student-123',
          firstName: 'Aarav',
          lastName: 'Sharma',
          studentParents: [
            {
              isPrimary: true,
              parent: {
                id: 'parent-456',
                firstName: 'Rajesh',
                lastName: 'Sharma',
                phone: '+919876500001',
                email: 'rajesh@example.com',
              },
            },
          ],
        }),
      },
    };

    const resolver = new RecipientResolverService(mockPrisma as any);
    const result = await resolver.resolveRecipients('student:student-123:parent', 'test-coaching-id');

    expect(result).toHaveLength(1);
    expect(result[0].phone).toBe('+919876500001');
    expect(result[0].email).toBe('rajesh@example.com');
    expect(result[0].name).toBe('Rajesh Sharma');
  });

  it('should resolve batch students for group fanning out', async () => {
    const mockPrisma = {
      student: {
        findMany: async () => [
          { id: 's1', firstName: 'Aarav', lastName: 'Sharma', phone: '+919876500001' },
          { id: 's2', firstName: 'Priya', lastName: 'Verma', phone: '+919876500002' },
        ],
      },
    };

    const resolver = new RecipientResolverService(mockPrisma as any);
    const result = await resolver.resolveRecipients('batch:batch-999:students', 'test-coaching-id');

    expect(result).toHaveLength(2);
    expect(result[0].phone).toBe('+919876500001');
    expect(result[1].phone).toBe('+919876500002');
  });

  describe('groups', () => {
    const anand = { id: 'p1', name: 'Anand Sharma', phone: '+919800000001' };
    const students = [
      { id: 's1', firstName: 'Aarav', lastName: 'Sharma', studentParents: [{ isPrimary: true, parent: anand }] },
      // A sibling: the same parent is messaged once
      { id: 's2', firstName: 'Diya', lastName: 'Sharma', studentParents: [{ isPrimary: true, parent: anand }] },
      { id: 's3', firstName: 'Kabir', lastName: 'Rao', studentParents: [] },
    ];

    function prismaFor(calls: any[]) {
      return {
        student: { findMany: async (args: any) => (calls.push(args), students) },
        teacher: {
          findMany: async (args: any) => (
            calls.push(args), [{ id: 't1', name: 'Ravi', phone: '+919800000009', email: null }]
          ),
        },
      };
    }

    it('resolves the whole institute for "all", not a batch called "all"', async () => {
      const calls: any[] = [];
      const resolver = new RecipientResolverService(prismaFor(calls) as any);
      const result = await resolver.resolveRecipients('batch:all:students', 'c1');
      expect(result.map((r) => r.recipientId)).toEqual(['s1', 's2', 's3']);
      expect(calls[0].where).toEqual({ coachingId: 'c1', deletedAt: null, isActive: true });
    });

    it('limits students to those currently in the batch', async () => {
      const calls: any[] = [];
      const resolver = new RecipientResolverService(prismaFor(calls) as any);
      await resolver.resolveRecipients('batch:b1:students', 'c1');
      expect(calls[0].where.batchStudents).toEqual({ some: { batchId: 'b1', leftAt: null } });
    });

    it("resolves each student's primary parent once", async () => {
      const resolver = new RecipientResolverService(prismaFor([]) as any);
      const result = await resolver.resolveRecipients('batch:b1:parents', 'c1');
      expect(result).toEqual([
        { recipientId: 'p1', phone: '+919800000001', email: undefined, name: 'Anand Sharma', recipientType: 'PARENT', studentName: 'Aarav Sharma and Diya Sharma' },
      ]);
    });

    it('resolves active teachers, of a batch or of the institute', async () => {
      const calls: any[] = [];
      const resolver = new RecipientResolverService(prismaFor(calls) as any);
      const result = await resolver.resolveRecipients('teachers:b1', 'c1');
      expect(result[0]).toMatchObject({ recipientId: 't1', recipientType: 'TEACHER' });
      expect(calls[0].where).toMatchObject({ isActive: true, teacherBatches: { some: { batchId: 'b1' } } });
      await resolver.resolveRecipients('teachers:all', 'c1');
      expect(calls[1].where.teacherBatches).toBeUndefined();
    });

    it('resolves an unknown token to nobody instead of using it as a phone number', async () => {
      const resolver = new RecipientResolverService({} as any);
      expect(await resolver.resolveRecipients('something:odd', 'c1')).toEqual([]);
    });
  });
});

describe('batch contacts (every parent and the student, each phone once)', () => {
  const parent = (id: string, phone: string | null, extra: Record<string, unknown> = {}) => ({
    parent: { id, name: `Parent ${id}`, phone, email: null, deletedAt: null, ...extra },
  });
  const resolve = async (students: unknown[]) =>
    new RecipientResolverService({ student: { findMany: async () => students } } as any).resolveRecipients(
      'batch:b1:contacts',
      'c1',
    );

  it('reaches both parents of a child, and the child, when their numbers differ', async () => {
    const result = await resolve([
      {
        id: 's1', firstName: 'Aarav', lastName: 'Sharma', phone: '+919876500003',
        studentParents: [parent('mother', '+919876500001'), parent('father', '+919876500002')],
      },
    ]);
    expect(result.map((r) => [r.recipientType, r.phone])).toEqual([
      ['PARENT', '+919876500001'],
      ['PARENT', '+919876500002'],
      ['STUDENT', '+919876500003'],
    ]);
  });

  it('sends one message per phone when a parent and the student share a number, however it is written', async () => {
    const result = await resolve([
      {
        id: 's1', firstName: 'Aarav', lastName: 'Sharma', phone: '98765 00001',
        studentParents: [parent('mother', '+91 98765-00001')],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ recipientType: 'PARENT', recipientId: 'mother' });
  });

  it('writes one message naming both children when a parent has two in the batch', async () => {
    const result = await resolve([
      { id: 's1', firstName: 'Aarav', lastName: 'Sharma', phone: null, studentParents: [parent('mother', '+919876500001')] },
      { id: 's2', firstName: 'Diya', lastName: 'Sharma', phone: null, studentParents: [parent('mother', '+919876500001')] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].studentName).toBe('Aarav Sharma and Diya Sharma');
  });

  it('skips deleted parents and numbers that are missing or too short', async () => {
    const result = await resolve([
      {
        id: 's1', firstName: 'Aarav', lastName: 'Sharma', phone: '12345',
        studentParents: [parent('gone', '+919876500001', { deletedAt: new Date() }), parent('nophone', null)],
      },
    ]);
    expect(result).toEqual([]);
  });
});
