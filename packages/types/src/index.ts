// ==========================================
// Vargly Core Types & Enums
// ==========================================

export enum RoleType {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OWNER = 'OWNER',
  TEACHER = 'TEACHER',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED',
}

export enum NotificationChannel {
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
}

export enum NotificationStatus {
  QUEUED = 'QUEUED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  GRACE = 'GRACE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum PlanCode {
  STARTER = 'STARTER',
  PRO_AI = 'PRO_AI',
  ENTERPRISE = 'ENTERPRISE',
}

export enum FeeInstallmentStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  WAIVED = 'WAIVED',
  OVERDUE = 'OVERDUE',
}

export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHEQUE = 'CHEQUE',
  CARD = 'CARD',
  ONLINE = 'ONLINE',
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AiProviderType {
  OPENAI = 'OPENAI',
  CLAUDE = 'CLAUDE',
  GEMINI = 'GEMINI',
  GROQ = 'GROQ',
}

// ==========================================
// Request Context Interface (AsyncLocalStorage)
// ==========================================
export interface RequestContextData {
  readonly coachingId?: string;
  readonly userId?: string;
  readonly userEmail?: string;
  readonly roles: RoleType[];
  readonly permissions: string[];
  readonly traceId: string;
  readonly planCode?: PlanCode;
  readonly features: string[];
}

// ==========================================
// Domain Event Interface
// ==========================================
export interface DomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventName: string;
  readonly coachingId: string;
  readonly occurredAt: Date;
  readonly payload: T;
  readonly metadata: {
    readonly correlationId: string;
    readonly userId?: string;
  };
}

// ==========================================
// API Response Envelopes
// ==========================================
export interface ApiResponse<T> {
  readonly data: T;
  readonly meta?: {
    readonly total?: number;
    readonly page?: number;
    readonly limit?: number;
    readonly nextCursor?: string;
  };
}

export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown> | Array<unknown>;
}

export interface ApiErrorResponse {
  readonly error: ApiErrorDetail;
}
