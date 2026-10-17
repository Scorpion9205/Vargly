import { AiProviderType } from '@vargly/types';

export interface GenerateAiCompletionDto {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly feature?: string;
  readonly provider?: AiProviderType;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** The reply must be one JSON object (the prompt has to ask for it) */
  readonly jsonMode?: boolean;
}

export interface GenerateStudentNarrativeDto {
  readonly studentId: string;
  readonly month?: number; // 1-12
  readonly year?: number;
  readonly customNotes?: string;
  readonly provider?: AiProviderType;
}

export interface GenerateParentReportCardDto {
  readonly studentId: string;
  readonly includeTestHistory?: boolean;
  readonly includeRemarks?: boolean;
  readonly provider?: AiProviderType;
}

export interface GenerateTeacherInsightDto {
  readonly teacherId: string;
  readonly periodDays?: number;
  readonly provider?: AiProviderType;
}

export interface AiWalletResponseDto {
  readonly id: string;
  readonly coachingId: string;
  readonly balance: number;
  readonly totalAllocated: number;
  readonly totalConsumed: number;
  readonly updatedAt: Date;
}

export interface AiUsageLogResponseDto {
  readonly id: string;
  readonly walletId: string;
  readonly feature: string;
  readonly provider: AiProviderType;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly creditsDeducted: number;
  readonly inputHash: string | null;
  readonly createdAt: Date;
}

export interface AiCompletionResponseDto {
  readonly content: string;
  readonly feature: string;
  readonly provider: AiProviderType;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly creditsDeducted: number;
  readonly isCached: boolean;
  readonly balanceRemaining: number;
}
