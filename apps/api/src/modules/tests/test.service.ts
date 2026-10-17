import { StatusCodes } from 'http-status-codes';
import { ITestRepository } from './test.repository.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import {
  CreateTestDto,
  StudentTestResultDto,
  TestResponseDto,
  UpdateTestDto,
  UploadMarksDto,
} from './dto/test.dto.js';
import { TestMapper } from './test.mapper.js';
import {
  createMarksUploadedEvent,
  createTestCreatedEvent,
  createTestResultReadyEvent,
} from './test.events.js';

export class TestService {
  public constructor(
    private readonly testRepository: ITestRepository,
    private readonly eventBus: IEventBus,
  ) {}

  public async createTest(
    dto: CreateTestDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<TestResponseDto> {
    if (dto.passingMarks !== undefined && dto.passingMarks > dto.totalMarks) {
      throw new AppError(
        'INVALID_PASSING_MARKS',
        'Passing marks cannot exceed total marks',
        StatusCodes.BAD_REQUEST,
      );
    }

    const testDate = new Date(dto.testDate);

    const test = await this.testRepository.create({
      coachingId,
      batchId: dto.batchId,
      title: dto.title,
      subject: dto.subject,
      testDate,
      totalMarks: dto.totalMarks,
      passingMarks: dto.passingMarks,
      createdBy: userId,
    });

    const responseDto = TestMapper.toResponseDto(test);

    await this.eventBus.publish(
      createTestCreatedEvent(
        {
          testId: responseDto.id,
          coachingId,
          batchId: dto.batchId,
          title: dto.title,
          subject: dto.subject,
          testDate,
          totalMarks: dto.totalMarks,
          passingMarks: dto.passingMarks,
        },
        correlationId,
        userId,
      ),
    );

    return responseDto;
  }

  public async uploadMarks(
    testId: string,
    dto: UploadMarksDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<TestResponseDto> {
    const existingTest = await this.testRepository.findById(testId);
    if (!existingTest) {
      throw new AppError('TEST_NOT_FOUND', 'Test not found', StatusCodes.NOT_FOUND);
    }

    const totalMarks = Number(existingTest.totalMarks);

    for (const entry of dto.results) {
      if (entry.marksObtained > totalMarks) {
        throw new AppError(
          'MARKS_EXCEED_TOTAL',
          `Marks obtained (${entry.marksObtained}) cannot exceed total marks (${totalMarks})`,
          StatusCodes.BAD_REQUEST,
        );
      }
    }

    // Marks belong to the test's own batch: a student of another batch must not get one, even
    // from a teacher who legitimately teaches this batch
    const studentIds = [...new Set(dto.results.map((entry) => entry.studentId))];
    const enrolled = new Set(
      await this.testRepository.findEnrolledStudentIds(existingTest.batchId, studentIds),
    );
    const outsiders = studentIds.filter((id) => !enrolled.has(id));
    if (outsiders.length > 0) {
      throw new AppError(
        'STUDENT_NOT_IN_BATCH',
        "Some students are not in this test's batch",
        StatusCodes.BAD_REQUEST,
        { studentIds: outsiders },
      );
    }

    const updatedTest = await this.testRepository.upsertMarks(testId, coachingId, dto.results);
    const responseDto = TestMapper.toResponseDto(updatedTest);

    await this.eventBus.publish(
      createMarksUploadedEvent(
        {
          testId,
          coachingId,
          batchId: existingTest.batchId,
          resultsCount: dto.results.length,
        },
        correlationId,
        userId,
      ),
    );

    // Emit TestResultReady for each student so subscribers (WhatsApp/Timeline) can notify parents
    for (const result of dto.results) {
      const percentage = totalMarks > 0 ? Math.round((result.marksObtained / totalMarks) * 10000) / 100 : 0;
      await this.eventBus.publish(
        createTestResultReadyEvent(
          {
            testId,
            testTitle: existingTest.title,
            studentId: result.studentId,
            coachingId,
            marksObtained: result.marksObtained,
            totalMarks,
            percentage,
            isAbsent: result.isAbsent ?? false,
          },
          correlationId,
          userId,
        ),
      );
    }

    return responseDto;
  }

  public async getTestById(id: string): Promise<TestResponseDto> {
    const test = await this.testRepository.findById(id);
    if (!test) {
      throw new AppError('TEST_NOT_FOUND', 'Test not found', StatusCodes.NOT_FOUND);
    }
    return TestMapper.toResponseDto(test);
  }

  public async getTestsByBatch(batchId: string): Promise<TestResponseDto[]> {
    const tests = await this.testRepository.findByBatch(batchId);
    return tests.map((t) => TestMapper.toResponseDto(t));
  }

  public async getResultsByStudent(studentId: string): Promise<StudentTestResultDto[]> {
    const rows = await this.testRepository.findByStudent(studentId);
    return rows.map(TestMapper.toStudentResultDto);
  }

  public async updateTest(id: string, dto: UpdateTestDto): Promise<TestResponseDto> {
    const existing = await this.testRepository.findById(id);
    if (!existing) {
      throw new AppError('TEST_NOT_FOUND', 'Test not found', StatusCodes.NOT_FOUND);
    }

    const totalMarks = dto.totalMarks ?? Number(existing.totalMarks);
    const savedPassing =
      existing.passingMarks === null || existing.passingMarks === undefined
        ? null
        : Number(existing.passingMarks);
    const passingMarks = dto.passingMarks !== undefined ? dto.passingMarks : savedPassing;
    if (passingMarks !== null && passingMarks > totalMarks) {
      throw new AppError(
        'INVALID_PASSING_MARKS',
        'Passing marks cannot be greater than total marks',
        StatusCodes.BAD_REQUEST,
      );
    }
    // Lowering the total below a mark already given would leave a score over 100%
    const highest = Math.max(
      0,
      ...(existing.results ?? []).map((result: any) => Number(result.marksObtained)),
    );
    if (highest > totalMarks) {
      throw new AppError(
        'MARKS_EXCEED_TOTAL',
        `A student already has ${highest} marks; total marks cannot be lower than that`,
        StatusCodes.BAD_REQUEST,
        { highestMarks: highest },
      );
    }

    const data: any = { ...dto };
    if (dto.testDate) data.testDate = new Date(dto.testDate);
    const updated = await this.testRepository.update(id, data);
    return TestMapper.toResponseDto(updated);
  }

  /** Soft delete: the test and its results disappear from lists and report cards */
  public async deleteTest(id: string): Promise<void> {
    const existing = await this.testRepository.findById(id);
    if (!existing) {
      throw new AppError('TEST_NOT_FOUND', 'Test not found', StatusCodes.NOT_FOUND);
    }
    await this.testRepository.softDelete(id);
  }
}
