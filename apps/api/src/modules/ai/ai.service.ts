import {
  GenerateAiCompletionDto,
  GenerateStudentNarrativeDto,
  GenerateParentReportCardDto,
  GenerateTeacherInsightDto,
  AiWalletResponseDto,
  AiUsageLogResponseDto,
  AiCompletionResponseDto,
} from './dto/ai.dto.js';
import { IAiRepository } from './ai.repository.js';
import { IAiProviderFactory } from './providers/ai-provider.interface.js';
import { IPromptCache } from './cache/redis-prompt.cache.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { AiMapper } from './ai.mapper.js';
import {
  createAiCreditsDeductedEvent,
  createAiGenerationCompletedEvent,
  createAiGenerationFailedEvent,
} from './ai.events.js';
import { logger } from '../../common/logger/logger.service.js';

export class InsufficientAiCreditsError extends Error {
  public readonly statusCode = 402;
  public readonly code = 'INSUFFICIENT_AI_CREDITS';

  public constructor(
    public readonly currentBalance: number,
    public readonly requiredCredits: number,
    public readonly buyCreditsUrl: string = '/billing/ai-credits',
  ) {
    super(
      `Insufficient AI credits. You have ${currentBalance} credits, but this operation requires ${requiredCredits} credits. Please purchase more credits to proceed.`,
    );
    this.name = 'InsufficientAiCreditsError';
  }
}

export class AiService {
  public constructor(
    private readonly repository: IAiRepository,
    private readonly providerFactory: IAiProviderFactory,
    private readonly cache: IPromptCache,
    private readonly eventBus: IEventBus,
  ) {}

  public async getWalletBalance(coachingId: string): Promise<AiWalletResponseDto> {
    const wallet = await this.repository.createOrGetWallet(coachingId);
    return AiMapper.toWalletDto(wallet);
  }

  public async getUsageLogs(
    coachingId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ logs: AiUsageLogResponseDto[]; total: number }> {
    const wallet = await this.repository.createOrGetWallet(coachingId);
    const [logs, total] = await Promise.all([
      this.repository.findUsageLogs(wallet.id, limit, offset),
      this.repository.findUsageLogsCount(wallet.id),
    ]);

    return {
      logs: logs.map((l) => AiMapper.toUsageLogDto(l)),
      total,
    };
  }

  /** Returns credits taken for a request whose result could not be used (e.g. an unreadable reply) */
  public async refundCredits(coachingId: string, credits: number): Promise<void> {
    if (credits <= 0) return;
    const wallet = await this.repository.createOrGetWallet(coachingId);
    await this.repository.refundCredits(wallet.id, credits);
  }

  public async generateCompletion(
    dto: GenerateAiCompletionDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
    creditsCost: number = 1,
  ): Promise<AiCompletionResponseDto> {
    const feature = dto.feature || 'ai.completion';
    const provider = this.providerFactory.getProvider(dto.provider);
    const providerType = provider.providerType;

    const wallet = await this.repository.createOrGetWallet(coachingId);

    // 1. Compute prompt input hash & check cache (cache hits are free)
    const inputHash = this.cache.computeHash({
      feature,
      prompt: dto.prompt,
      systemPrompt: dto.systemPrompt,
      model: dto.model,
    });

    const cachedContent = await this.cache.get(coachingId, feature, inputHash);
    if (cachedContent) {
      logger.info(`[AiService] Cache HIT for ${feature} (0 credits deducted)`);
      return AiMapper.toCompletionDto({
        content: cachedContent,
        feature,
        provider: providerType,
        model: dto.model || 'cached',
        promptTokens: 0,
        completionTokens: 0,
        creditsDeducted: 0,
        isCached: true,
        balanceRemaining: wallet.balance,
      });
    }

    // 2. Reserve the credits before paying for a provider call. A check-then-deduct would let
    //    concurrent requests all pass the check and overdraw the wallet.
    const updatedWallet = await this.repository.reserveCredits(wallet.id, creditsCost);
    if (!updatedWallet) {
      throw new InsufficientAiCreditsError(wallet.balance, creditsCost);
    }

    // 3. Execute model completion; the reservation is refunded if it fails
    try {
      let completionResult;
      try {
        completionResult = await provider.generateCompletion({
          prompt: dto.prompt,
          systemPrompt: dto.systemPrompt,
          model: dto.model,
          temperature: dto.temperature,
          maxTokens: dto.maxTokens,
          jsonMode: dto.jsonMode,
        });
      } catch (providerErr) {
        await this.repository.refundCredits(wallet.id, creditsCost);
        throw providerErr;
      }

      // 4. Record usage against the reserved credits
      await this.repository.logUsage({
        walletId: wallet.id,
        feature,
        provider: completionResult.provider,
        model: completionResult.model,
        promptTokens: completionResult.promptTokens,
        completionTokens: completionResult.completionTokens,
        creditsDeducted: creditsCost,
        inputHash,
      });

      // 5. Store in Redis prompt cache (24h TTL)
      await this.cache.set(coachingId, feature, inputHash, completionResult.content, 86400);

      // 6. Publish domain events
      await this.eventBus.publish(
        createAiCreditsDeductedEvent(
          {
            coachingId,
            walletId: wallet.id,
            creditsDeducted: creditsCost,
            balanceRemaining: updatedWallet.balance,
            feature,
            provider: completionResult.provider,
            model: completionResult.model,
          },
          correlationId,
          userId,
        ),
      );

      await this.eventBus.publish(
        createAiGenerationCompletedEvent(
          {
            coachingId,
            walletId: wallet.id,
            feature,
            provider: completionResult.provider,
            model: completionResult.model,
            promptTokens: completionResult.promptTokens,
            completionTokens: completionResult.completionTokens,
            creditsDeducted: creditsCost,
            isCached: false,
          },
          correlationId,
          userId,
        ),
      );

      return AiMapper.toCompletionDto({
        content: completionResult.content,
        feature,
        provider: completionResult.provider,
        model: completionResult.model,
        promptTokens: completionResult.promptTokens,
        completionTokens: completionResult.completionTokens,
        creditsDeducted: creditsCost,
        isCached: false,
        balanceRemaining: updatedWallet.balance,
      });
    } catch (err) {
      await this.eventBus.publish(
        createAiGenerationFailedEvent(
          {
            coachingId,
            feature,
            error: (err as Error).message,
          },
          correlationId,
          userId,
        ),
      );
      throw err;
    }
  }

  public async generateStudentMonthlyProgress(
    dto: GenerateStudentNarrativeDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<AiCompletionResponseDto> {
    const studentSnapshot = await this.repository.getStudentAcademicSnapshot(
      dto.studentId,
      coachingId,
    );

    if (!studentSnapshot) {
      throw new Error(`Student not found with ID: ${dto.studentId}`);
    }

    const monthStr = dto.month ? `Month: ${dto.month}/${dto.year || new Date().getFullYear()}` : 'Past 30 Days';

    const prompt =
      `Generate a concise, constructive 2-paragraph student academic progress narrative for parents.\n` +
      `Student Details:\n` +
      `- Name: ${studentSnapshot.studentName}\n` +
      `- Batch: ${studentSnapshot.batchName}\n` +
      `- Evaluation Period: ${monthStr}\n` +
      `- Attendance: ${studentSnapshot.attendancePercentage}% (${studentSnapshot.attendedClasses}/${studentSnapshot.totalClasses} classes)\n` +
      `- Homework Completion: ${studentSnapshot.homeworkCompletionRate}%\n` +
      `- Recent Test Scores: ${
        studentSnapshot.recentTestResults.length > 0
          ? studentSnapshot.recentTestResults
              .map((t) => `${t.testTitle} (${t.marksObtained}/${t.totalMarks}, ${t.percentage}%)`)
              .join(', ')
          : 'No recent tests'
      }\n` +
      (dto.customNotes ? `- Teacher's Specific Note: ${dto.customNotes}\n` : '') +
      `\nInstructions: Highlight key strengths, note any academic dips objectively, and offer encouraging, actionable guidance for home study.`;

    const systemPrompt =
      'You are Vargly Senior Academic Advisor, an expert Indian coaching mentor crafting professional, empathetic, and motivating student progress updates for parents.';

    return this.generateCompletion(
      {
        prompt,
        systemPrompt,
        feature: 'ai.student_narrative',
        provider: dto.provider,
        temperature: 0.6,
        maxTokens: 500,
      },
      coachingId,
      userId,
      correlationId,
      2, // Cost: 2 credits
    );
  }

  public async generateParentWhatsAppReportCard(
    dto: GenerateParentReportCardDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<AiCompletionResponseDto> {
    const studentSnapshot = await this.repository.getStudentAcademicSnapshot(
      dto.studentId,
      coachingId,
    );

    if (!studentSnapshot) {
      throw new Error(`Student not found with ID: ${dto.studentId}`);
    }

    const prompt =
      `Draft a clean, professional WhatsApp report card message for the parent of ${studentSnapshot.studentName}.\n` +
      `Data:\n` +
      `- Roll No: ${studentSnapshot.rollNumber}\n` +
      `- Batch: ${studentSnapshot.batchName}\n` +
      `- Attendance: ${studentSnapshot.attendancePercentage}%\n` +
      `- Homework Completion: ${studentSnapshot.homeworkCompletionRate}%\n` +
      `- Recent Tests: ${
        studentSnapshot.recentTestResults
          .map((t) => `${t.testTitle}: ${t.marksObtained}/${t.totalMarks} (${t.percentage}%)`)
          .join('; ') || 'All assessments up to date'
      }\n` +
      `- Pending Fee Status: ${
        studentSnapshot.pendingFeeAmount > 0
          ? `INR ${studentSnapshot.pendingFeeAmount} pending`
          : 'All dues clear'
      }\n\n` +
      `Instructions: Format strictly with WhatsApp markdown (*bold* for highlights, emojis for sections, clean bullets). Keep it under 250 words.`;

    const systemPrompt =
      'You are Vargly WhatsApp Assistant generator. Format messages cleanly for instant parent readability on mobile devices.';

    return this.generateCompletion(
      {
        prompt,
        systemPrompt,
        feature: 'ai.parent_report',
        provider: dto.provider,
        temperature: 0.5,
        maxTokens: 400,
      },
      coachingId,
      userId,
      correlationId,
      1, // Cost: 1 credit
    );
  }

  public async generateTeacherPerformanceInsight(
    dto: GenerateTeacherInsightDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<AiCompletionResponseDto> {
    const teacherSnapshot = await this.repository.getTeacherAcademicSnapshot(
      dto.teacherId,
      coachingId,
    );

    if (!teacherSnapshot) {
      throw new Error(`Teacher not found with ID: ${dto.teacherId}`);
    }

    const batchSummaries = teacherSnapshot.batches
      .map(
        (b) =>
          `* ${b.batchName}: ${b.studentCount} students, ${b.avgAttendancePct}% avg attendance, ${b.avgTestScorePct}% avg test score, ${b.homeworkSubmissionPct}% homework rate`,
      )
      .join('\n');

    const prompt =
      `Provide an executive performance and pedagogical insight for Teacher: ${teacherSnapshot.teacherName}.\n` +
      `Batches Taught:\n` +
      `${batchSummaries}\n\n` +
      `Instructions: Provide an executive summary of batch health, point out areas of student engagement strength, identify batches requiring academic intervention, and recommend 2 concrete teaching strategies.`;

    const systemPrompt =
      'You are Vargly Chief Academic Director analyzing faculty performance and batch learning curves to improve coaching institute outcomes.';

    return this.generateCompletion(
      {
        prompt,
        systemPrompt,
        feature: 'ai.teacher_insight',
        provider: dto.provider,
        temperature: 0.6,
        maxTokens: 600,
      },
      coachingId,
      userId,
      correlationId,
      3, // Cost: 3 credits
    );
  }
}
