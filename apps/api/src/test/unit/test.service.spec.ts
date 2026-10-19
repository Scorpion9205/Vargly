import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestService } from '../../modules/tests/test.service.js';
import { ITestRepository, CreateTestInput } from '../../modules/tests/test.repository.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { TEST_EVENTS } from '../../modules/tests/test.events.js';
import { StudentMarkEntryDto } from '../../modules/tests/dto/test.dto.js';

class InMemoryTestRepository implements ITestRepository {
  public tests: Map<string, any> = new Map();
  /** Students enrolled per batch; a batch with no entry here enrols everyone */
  public enrolment: Map<string, string[]> = new Map();

  public async findEnrolledStudentIds(batchId: string, studentIds: string[]): Promise<string[]> {
    const enrolled = this.enrolment.get(batchId);
    return enrolled ? studentIds.filter((id) => enrolled.includes(id)) : studentIds;
  }

  public async create(input: CreateTestInput): Promise<any> {
    const test = {
      id: `test-${Date.now()}-${Math.random()}`,
      coachingId: input.coachingId,
      batchId: input.batchId,
      title: input.title,
      subject: input.subject,
      testDate: input.testDate,
      totalMarks: input.totalMarks,
      passingMarks: input.passingMarks,
      createdBy: input.createdBy,
      createdAt: new Date(),
      results: [],
    };
    this.tests.set(test.id, test);
    return test;
  }

  public async findById(id: string): Promise<any | null> {
    const t = this.tests.get(id);
    if (!t || t.deletedAt) return null;
    return t;
  }

  public async findByBatch(batchId: string): Promise<any[]> {
    return Array.from(this.tests.values()).filter((t) => t.batchId === batchId && !t.deletedAt);
  }

  public async upsertMarks(testId: string, coachingId: string, entries: StudentMarkEntryDto[]): Promise<any> {
    const test = this.tests.get(testId);
    if (!test) throw new Error('Test not found');

    test.results = entries.map((e, idx) => ({
      id: `res-${testId}-${e.studentId}`,
      coachingId,
      testId,
      studentId: e.studentId,
      marksObtained: e.marksObtained,
      isAbsent: e.isAbsent ?? false,
      remarks: e.remarks,
      student: { firstName: 'Student', lastName: `${idx + 1}` },
    }));

    this.tests.set(testId, test);
    return test;
  }

  public async update(id: string, data: any): Promise<any> {
    const test = this.tests.get(id);
    if (!test) throw new Error('Test not found');
    Object.assign(test, data);
    return test;
  }

  public async softDelete(id: string): Promise<void> {
    const test = this.tests.get(id);
    if (test) test.deletedAt = new Date();
  }

  public async findByStudent(studentId: string): Promise<any[]> {
    const results: any[] = [];
    for (const test of this.tests.values()) {
      for (const res of test.results || []) {
        if (res.studentId === studentId) {
          results.push({ ...res, test });
        }
      }
    }
    return results;
  }
}

describe('TestService (Phase 2 Domain Unit Tests)', () => {
  let testService: TestService;
  let testRepo: InMemoryTestRepository;
  let mockEventBus: IEventBus;

  beforeEach(() => {
    testRepo = new InMemoryTestRepository();
    mockEventBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      publishBatch: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    testService = new TestService(testRepo, mockEventBus);
  });

  it('should successfully create a test and emit TestCreated event', async () => {
    const result = await testService.createTest(
      {
        batchId: 'batch-101',
        title: 'Midterm Physics',
        subject: 'Physics',
        testDate: '2026-09-20',
        totalMarks: 100,
        passingMarks: 40,
      },
      'coaching-1',
      'teacher-1',
    );

    expect(result).toBeDefined();
    expect(result.title).toBe('Midterm Physics');
    expect(result.totalMarks).toBe(100);
    expect(result.passingMarks).toBe(40);

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: TEST_EVENTS.TEST_CREATED,
        coachingId: 'coaching-1',
        payload: expect.objectContaining({
          testId: result.id,
          title: 'Midterm Physics',
        }),
      }),
    );
  });

  it('should throw BAD_REQUEST when passing marks exceed total marks', async () => {
    await expect(
      testService.createTest(
        {
          batchId: 'batch-101',
          title: 'Quiz',
          subject: 'Math',
          testDate: '2026-09-20',
          totalMarks: 50,
          passingMarks: 60, // Invalid!
        },
        'coaching-1',
      ),
    ).rejects.toThrow(AppError);
  });

  it('should upload marks, compute average/highest stats, and emit MarksUploaded & TestResultReady', async () => {
    const created = await testService.createTest(
      {
        batchId: 'batch-101',
        title: 'Weekly Test',
        subject: 'Chemistry',
        testDate: '2026-09-20',
        totalMarks: 100,
      },
      'coaching-1',
    );

    const updated = await testService.uploadMarks(
      created.id,
      {
        results: [
          { studentId: 'stu-1', marksObtained: 80 },
          { studentId: 'stu-2', marksObtained: 90 },
          { studentId: 'stu-3', marksObtained: 0, isAbsent: true },
        ],
      },
      'coaching-1',
      'teacher-1',
    );

    expect(updated.results).toHaveLength(3);
    expect(updated.averageScore).toBe(85); // (80 + 90) / 2
    expect(updated.highestScore).toBe(90);

    // Event checking
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: TEST_EVENTS.MARKS_UPLOADED,
        payload: expect.objectContaining({
          testId: created.id,
          resultsCount: 3,
        }),
      }),
    );

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: TEST_EVENTS.TEST_RESULT_READY,
        payload: expect.objectContaining({
          studentId: 'stu-2',
          marksObtained: 90,
          percentage: 90,
        }),
      }),
    );
  });

  it('should reject marks upload if any mark exceeds totalMarks', async () => {
    const created = await testService.createTest(
      {
        batchId: 'batch-101',
        title: 'Quick Test',
        subject: 'English',
        testDate: '2026-09-20',
        totalMarks: 50,
      },
      'coaching-1',
    );

    await expect(
      testService.uploadMarks(
        created.id,
        {
          results: [{ studentId: 'stu-1', marksObtained: 55 }], // Exceeds 50!
        },
        'coaching-1',
      ),
    ).rejects.toThrow(AppError);
  });

  describe('marks for students outside the test batch', () => {
    const makeTest = () =>
      testService.createTest(
        { batchId: 'batch-101', title: 'Unit test', subject: 'Maths', testDate: '2026-09-20', totalMarks: 100 },
        'coaching-1',
      );

    it('refuses marks for a student who is not in the batch, and stores none of the batch', async () => {
      testRepo.enrolment.set('batch-101', ['stu-1', 'stu-2']);
      const created = await makeTest();

      await expect(
        testService.uploadMarks(
          created.id,
          { results: [{ studentId: 'stu-1', marksObtained: 70 }, { studentId: 'other-batch-kid', marksObtained: 90 }] },
          'coaching-1',
        ),
      ).rejects.toMatchObject({
        code: 'STUDENT_NOT_IN_BATCH',
        statusCode: 400,
        details: { studentIds: ['other-batch-kid'] },
      });
      expect(testRepo.tests.get(created.id).results).toHaveLength(0);
    });

    it('accepts marks when every student is in the batch, including a repeated entry', async () => {
      testRepo.enrolment.set('batch-101', ['stu-1', 'stu-2']);
      const created = await makeTest();

      const updated = await testService.uploadMarks(
        created.id,
        { results: [{ studentId: 'stu-1', marksObtained: 70 }, { studentId: 'stu-2', marksObtained: 80 }] },
        'coaching-1',
      );
      expect(updated.results).toHaveLength(2);
    });
  });

  describe('editing, deleting and student reports', () => {
    const create = () =>
      testService.createTest(
        {
          batchId: 'batch-101',
          title: 'Unit Test 1',
          subject: 'Physics',
          testDate: '2026-09-20',
          totalMarks: 50,
          passingMarks: 20,
        },
        'coaching-1',
      );

    it('updates details and can remove the pass mark', async () => {
      const test = await create();
      const updated = await testService.updateTest(test.id, {
        title: 'Unit Test 1 (retest)',
        passingMarks: null,
      });
      expect(updated).toMatchObject({ title: 'Unit Test 1 (retest)', passingMarks: undefined });
    });

    it('rejects a pass mark above the total, checking against the saved total', async () => {
      const test = await create();
      await expect(testService.updateTest(test.id, { passingMarks: 60 })).rejects.toMatchObject({
        code: 'INVALID_PASSING_MARKS',
      });
    });

    it('will not lower the total below marks already given', async () => {
      const test = await create();
      await testService.uploadMarks(
        test.id,
        { results: [{ studentId: 's1', marksObtained: 42, isAbsent: false }] },
        'coaching-1',
      );

      await expect(testService.updateTest(test.id, { totalMarks: 40 })).rejects.toMatchObject({
        code: 'MARKS_EXCEED_TOTAL',
      });
      await expect(testService.updateTest(test.id, { totalMarks: 45 })).resolves.toMatchObject({
        totalMarks: 45,
      });
    });

    it('deletes a test', async () => {
      const test = await create();
      await testService.deleteTest(test.id);
      await expect(testService.getTestById(test.id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("lists a student's results as numbers with a percentage", async () => {
      const test = await create();
      await testService.uploadMarks(
        test.id,
        { results: [{ studentId: 's1', marksObtained: 40, isAbsent: false }] },
        'coaching-1',
      );

      const [result] = await testService.getResultsByStudent('s1');
      expect(result).toMatchObject({
        testId: test.id,
        title: 'Unit Test 1',
        subject: 'Physics',
        totalMarks: 50,
        passingMarks: 20,
        marksObtained: 40,
        percentage: 80,
        isAbsent: false,
      });
    });
  });
});
