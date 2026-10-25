import { HomeworkResponseDto } from './dto/homework.dto.js';

export class HomeworkMapper {
  public static toResponseDto(entity: any): HomeworkResponseDto {
    return {
      id: entity.id,
      coachingId: entity.coachingId,
      batchId: entity.batchId,
      title: entity.title,
      description: entity.description,
      dueDate: new Date(entity.dueDate),
      attachmentUrl: entity.attachmentUrl,
      // How many students marked it done in their panel
      completedCount: entity._count?.completions ?? 0,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
