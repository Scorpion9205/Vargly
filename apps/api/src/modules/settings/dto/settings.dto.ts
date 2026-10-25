export interface BrandingConfig {
  readonly logoUrl?: string;
  readonly primaryColor?: string;
  readonly headerText?: string;
}

export interface NotificationSettingsConfig {
  readonly whatsappEnabled?: boolean;
  readonly emailEnabled?: boolean;
  readonly defaultSenderName?: string;
}

/** What students may use. The panel is on unless switched off; fees stay hidden unless the owner shows them. */
export interface StudentPortalConfig {
  readonly enabled?: boolean;
  readonly showFees?: boolean;
  /** Students may ask the AI a study doubt (uses the institute's AI credits); off unless the owner turns it on */
  readonly doubts?: boolean;
}

export interface CoachingConfig {
  readonly branding?: BrandingConfig;
  readonly timezone?: string;
  readonly currency?: string;
  readonly academicYear?: string;
  readonly notifications?: NotificationSettingsConfig;
  readonly receiptPrefix?: string;
  readonly attendanceThreshold?: number; // e.g. 75 (%)
  readonly studentPortal?: StudentPortalConfig;
  readonly [key: string]: unknown;
}

export interface UpdateSettingsDto {
  readonly branding?: BrandingConfig;
  readonly timezone?: string;
  readonly currency?: string;
  readonly academicYear?: string;
  readonly notifications?: NotificationSettingsConfig;
  readonly receiptPrefix?: string;
  readonly attendanceThreshold?: number;
  readonly studentPortal?: StudentPortalConfig;
}

export interface SettingsResponseDto {
  readonly id: string;
  readonly coachingId: string;
  readonly config: CoachingConfig;
  readonly updatedAt: Date;
}
