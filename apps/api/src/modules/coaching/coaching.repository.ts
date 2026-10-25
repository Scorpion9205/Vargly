import { RequestContextService } from '../../common/services/request-context.service.js';
import {
  getPrismaClient,
  ExtendedPrismaClient,
} from '../../database/prisma/tenant-prisma.extension.js';
import { PlanCode, RoleType, SubscriptionStatus } from '@vargly/types';

export interface CreateCoachingTransactionInput {
  coachingName: string;
  coachingCode: string;
  phone: string;
  email: string;
  address?: string;
  city?: string;
  state?: string;
  timezone: string;
  currency: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPasswordHash: string;
  trialDays: number;
  initialCredits: number;
}

export interface ICoachingRepository {
  findByCode(code: string): Promise<any | null>;
  findById(id: string): Promise<any | null>;
  update(id: string, data: Record<string, unknown>): Promise<any>;
  createWithProvisioning(
    input: CreateCoachingTransactionInput,
  ): Promise<{ coaching: any; ownerUser: any }>;
}

export class PrismaCoachingRepository implements ICoachingRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async findByCode(code: string): Promise<any | null> {
    return (this.prisma as any).coaching.findUnique({
      where: { code },
      include: {
        subscriptions: {
          where: { isActive: true },
          include: { plan: true },
          take: 1,
        },
      },
    });
  }

  public async findById(id: string): Promise<any | null> {
    return (this.prisma as any).coaching.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: { isActive: true },
          include: { plan: true },
          take: 1,
        },
      },
    });
  }

  public async update(id: string, data: Record<string, unknown>): Promise<any> {
    return (this.prisma as any).coaching.update({
      where: { id },
      data,
      include: {
        subscriptions: {
          where: { isActive: true },
          include: { plan: true },
          take: 1,
        },
      },
    });
  }

  public async createWithProvisioning(
    input: CreateCoachingTransactionInput,
  ): Promise<{ coaching: any; ownerUser: any }> {
    const rawPrisma = this.prisma as any;

    // Provisioning creates the tenant itself, so no coachingId can be in context yet.
    // Every row below sets coachingId explicitly.
    return RequestContextService.runAsSystem('coaching:provision', () =>
      rawPrisma.$transaction(async (tx: any) => {
        // 1. Create Coaching
        const coaching = await tx.coaching.create({
          data: {
            name: input.coachingName,
            code: input.coachingCode,
            phone: input.phone,
            email: input.email,
            address: input.address,
            city: input.city,
            state: input.state,
            timezone: input.timezone,
            currency: input.currency,
          },
        });

        // 2. Create Owner User
        const ownerUser = await tx.user.create({
          data: {
            coachingId: coaching.id,
            name: input.ownerName,
            email: input.ownerEmail,
            phone: input.ownerPhone,
            passwordHash: input.ownerPasswordHash,
          },
        });

        // 3. Ensure OWNER Role exists or find it
        let ownerRole = await tx.role.findFirst({
          where: { code: RoleType.OWNER },
        });

        if (!ownerRole) {
          ownerRole = await tx.role.create({
            data: {
              name: 'Coaching Owner',
              code: RoleType.OWNER,
              description: 'Full administrative control over the coaching institute',
              isSystem: true,
            },
          });
        }

        // 4. Assign OWNER Role to User
        await tx.userRole.create({
          data: {
            userId: ownerUser.id,
            roleId: ownerRole.id,
            coachingId: coaching.id,
          },
        });

        // 5. Ensure ENTERPRISE / Trial Plan exists with full feature bundle unlocked
        const fullFeatures = [
          'core',
          'attendance',
          'fees',
          'homework',
          'tests',
          'reports',
          'salary',
          'expenses',
          'ai.summary',
          'ai.parent_report',
          'ai.insights',
          'ai.risk_engine',
          'whatsapp.assistant',
        ];

        let trialPlan = await tx.plan.findUnique({
          where: { code: PlanCode.ENTERPRISE },
        });

        if (!trialPlan) {
          trialPlan = await tx.plan.create({
            data: {
              code: PlanCode.ENTERPRISE,
              name: 'Enterprise Pro AI Bundle',
              priceMonthly: 0,
              priceYearly: 0,
              defaultFeatures: fullFeatures,
              defaultCredits: 1000,
            },
          });
        }

        // 6. Create TRIALING Subscription (90 days full access)
        const trialStartsAt = new Date();
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + input.trialDays);

        await tx.subscription.create({
          data: {
            coachingId: coaching.id,
            planId: trialPlan.id,
            status: SubscriptionStatus.TRIALING,
            trialStartsAt,
            trialEndsAt,
            currentPeriodStart: trialStartsAt,
            currentPeriodEnd: trialEndsAt,
            isActive: true,
          },
        });

        // 7. Initialize AI Credit Wallet
        await tx.aiCreditWallet.create({
          data: {
            coachingId: coaching.id,
            balance: input.initialCredits,
            totalAllocated: input.initialCredits,
            totalConsumed: 0,
          },
        });

        // 8. Initialize Setting JSONB
        await tx.setting.create({
          data: {
            coachingId: coaching.id,
            config: {
              brandName: input.coachingName,
              timezone: input.timezone,
              currency: input.currency,
              channels: {
                whatsappEnabled: true,
                emailEnabled: true,
              },
            },
          },
        });

        // Fetch refreshed coaching with relations
        const finalCoaching = await tx.coaching.findUnique({
          where: { id: coaching.id },
          include: {
            subscriptions: {
              where: { isActive: true },
              include: { plan: true },
              take: 1,
            },
          },
        });

        return { coaching: finalCoaching, ownerUser };
      }),
    );
  }
}
