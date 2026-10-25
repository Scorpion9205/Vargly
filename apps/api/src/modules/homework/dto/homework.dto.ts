export interface CreateHomeworkDto {
  readonly batchId: string;
  readonly title: string;
  readonly description: string;
  readonly dueDate: string; // YYYY-MM-DD
  readonly attachmentUrl?: string;
}

export interface UpdateHomeworkDto {
  readonly title?: string;
  readonly description?: string;
  readonly dueDate?: string;
  readonly attachmentUrl?: string;
}

export interface HomeworkResponseDto {
  readonly id: string;
  readonly coachingId: string;
  readonly batchId: string;
  readonly title: string;
  readonly description: string;
  readonly dueDate: Date;
  readonly attachmentUrl?: string | null;
  /** How many students marked it done in the student panel */
  readonly completedCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
