import { ISettingsRepository } from './settings.repository.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { CoachingConfig, SettingsResponseDto, UpdateSettingsDto } from './dto/settings.dto.js';
import { SettingsMapper } from './settings.mapper.js';
import { createSettingsUpdatedEvent } from './settings.events.js';
import { DEFAULT_RECEIPT_PREFIX } from './settings.preferences.js';

export const DEFAULT_COACHING_CONFIG: CoachingConfig = {
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  academicYear: '2026-2027',
  receiptPrefix: DEFAULT_RECEIPT_PREFIX,
  attendanceThreshold: 75,
  branding: {
    primaryColor: '#4F46E5',
    headerText: 'Vargly Coaching Institute',
  },
  notifications: {
    whatsappEnabled: true,
    emailEnabled: true,
    defaultSenderName: 'Vargly Institute',
  },
};

export class SettingsService {
  public constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly eventBus: IEventBus,
  ) {}

  public async getSettings(coachingId: string): Promise<SettingsResponseDto> {
    let setting = await this.settingsRepository.findByCoachingId(coachingId);

    if (!setting) {
      setting = await this.settingsRepository.upsert(coachingId, DEFAULT_COACHING_CONFIG as Record<string, unknown>);
    }

    return SettingsMapper.toResponseDto(setting);
  }

  public async updateSettings(
    dto: UpdateSettingsDto,
    coachingId: string,
    userId?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<SettingsResponseDto> {
    const existing = await this.getSettings(coachingId);

    const mergedConfig: CoachingConfig = {
      ...existing.config,
      ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.academicYear !== undefined && { academicYear: dto.academicYear }),
      ...(dto.receiptPrefix !== undefined && { receiptPrefix: dto.receiptPrefix }),
      ...(dto.attendanceThreshold !== undefined && { attendanceThreshold: dto.attendanceThreshold }),
      ...(dto.branding && {
        branding: {
          ...existing.config.branding,
          ...dto.branding,
        },
      }),
      ...(dto.studentPortal && {
        studentPortal: {
          ...existing.config.studentPortal,
          ...dto.studentPortal,
        },
      }),
      ...(dto.notifications && {
        notifications: {
          ...existing.config.notifications,
          ...dto.notifications,
        },
      }),
    };

    const updated = await this.settingsRepository.upsert(coachingId, mergedConfig as Record<string, unknown>);
    const responseDto = SettingsMapper.toResponseDto(updated);

    await this.eventBus.publish(
      createSettingsUpdatedEvent(
        {
          coachingId,
          config: responseDto.config,
        },
        correlationId,
        userId,
      ),
    );

    return responseDto;
  }
}
