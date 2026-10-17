import { getPrismaClient, ExtendedPrismaClient } from '../../database/prisma/tenant-prisma.extension.js';
import { PlanCode, SubscriptionStatus } from '@vargly/types';
import { nextDocumentNumber } from '../../common/money/document-number.js';
import { MONEY_TRANSACTION } from '../../common/money/transaction-options.js';

export type BillingCycle = 'MONTHLY' | 'YEARLY';

export interface CreateBillingPaymentInput {
  coachingId: string;
  type: 'PLAN_UPGRADE' | 'AI_CREDITS';
  planCode?: PlanCode;
  billingCycle?: BillingCycle;
  credits?: number;
  amountPaise: number;
  gatewayOrderId: string;
  createdBy?: string;
}

export interface SettlePaymentInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amountPaidPaise: number;
  paidAt: Date;
}

export type SettlePaymentResult =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'duplicate'; readonly payment: any }
  | { readonly kind: 'amount_mismatch'; readonly payment: any }
  | {
      readonly kind: 'settled';
      readonly payment: any;
      readonly subscription?: any;
      readonly creditsAdded: number;
      readonly walletBalance: number;
    };

export interface IBillingRepository {
  findCurrentSubscription(coachingId: string): Promise<any | null>;
  findPlanByCode(code: PlanCode): Promise<any | null>;
  findAllActivePlans(): Promise<any[]>;
  findExpiringSubscriptions(threshold: Date): Promise<any[]>;
  updateSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<any>;
  getCreditWallet(coachingId: string): Promise<any | null>;
  /** Records an order at the server-computed price, before the customer pays. */
  createPaymentRecord(input: CreateBillingPaymentInput): Promise<any>;
  /**
   * Settles a paid order at most once, in one transaction: verifies the amount, marks it paid,
   * issues the invoice number and applies the plan or credits.
   */
  settlePayment(input: SettlePaymentInput): Promise<SettlePaymentResult>;
  /** Orders that were paid or failed, newest first (abandoned checkouts are left out) */
  listPayments(coachingId: string, limit: number): Promise<any[]>;
  findPaymentByOrderId(gatewayOrderId: string): Promise<any | null>;
}

/** What was expected and what arrived, for the person who resolves the payment */
export function mismatchNote(expectedPaise: number, input: SettlePaymentInput): string {
  return (
    `Order expected ${(expectedPaise / 100).toFixed(2)} INR but ${(input.amountPaidPaise / 100).toFixed(2)} INR ` +
    `was paid (gateway payment ${input.gatewayPaymentId}). Nothing was applied; refund or fix the order.`
  );
}

function periodEnd(from: Date, cycle: BillingCycle): Date {
  const end = new Date(from);
  if (cycle === 'MONTHLY') end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  return end;
}

export class PrismaBillingRepository implements IBillingRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async findCurrentSubscription(coachingId: string): Promise<any | null> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.subscription.findFirst({
      where: { coachingId, isActive: true },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async findPlanByCode(code: PlanCode): Promise<any | null> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.plan.findUnique({
      where: { code },
    });
  }

  public async findAllActivePlans(): Promise<any[]> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });
  }

  public async findExpiringSubscriptions(threshold: Date): Promise<any[]> {
    const rawPrisma = this.prisma as any;
    // Trials end at trialEndsAt; paid plans at currentPeriodEnd (a paid plan's trial date is
    // already in the past, so checking it would expire paying customers).
    return rawPrisma.subscription.findMany({
      where: {
        isActive: true,
        OR: [
          { status: SubscriptionStatus.TRIALING, trialEndsAt: { lte: threshold } },
          { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: { lte: threshold } },
        ],
      },
      include: { plan: true },
    });
  }

  public async updateSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<any> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.subscription.update({
      where: { id },
      data: { status },
      include: { plan: true },
    });
  }

  public async getCreditWallet(coachingId: string): Promise<any | null> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.aiCreditWallet.findUnique({
      where: { coachingId },
    });
  }

  public async createPaymentRecord(input: CreateBillingPaymentInput): Promise<any> {
    const rawPrisma = this.prisma as any;
    return rawPrisma.billingPayment.create({ data: { ...input } });
  }

  public async listPayments(coachingId: string, limit: number): Promise<any[]> {
    return (this.prisma as any).billingPayment.findMany({
      where: { coachingId, status: { not: 'CREATED' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
  }

  public async findPaymentByOrderId(gatewayOrderId: string): Promise<any | null> {
    return (this.prisma as any).billingPayment.findUnique({ where: { gatewayOrderId } });
  }

  public async settlePayment(input: SettlePaymentInput): Promise<SettlePaymentResult> {
    const rawPrisma = this.prisma as any;

    return rawPrisma.$transaction(async (tx: any) => {
      // Lock the order row so concurrent deliveries of the same webhook settle it once
      const locked: Array<{ id: string }> = await tx.$queryRaw`
        SELECT id FROM billing_payments WHERE gateway_order_id = ${input.gatewayOrderId} FOR UPDATE
      `;
      if (locked.length === 0) return { kind: 'not_found' } as const;

      const payment = await tx.billingPayment.findUnique({ where: { id: locked[0].id } });
      if (payment.status !== 'CREATED') return { kind: 'duplicate', payment } as const;
      if (payment.amountPaise !== input.amountPaidPaise) {
        // Nothing is applied, but the payment must not live only in the logs: keep it for a person
        const flagged = await tx.billingPayment.update({
          where: { id: payment.id },
          data: {
            status: 'NEEDS_REVIEW',
            gatewayPaymentId: input.gatewayPaymentId,
            reviewNote: mismatchNote(payment.amountPaise, input),
          },
        });
        return { kind: 'amount_mismatch', payment: flagged } as const;
      }

      const invoiceNumber = await nextDocumentNumber(tx, 'platform', 'INV', input.paidAt);
      const settled = await tx.billingPayment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          gatewayPaymentId: input.gatewayPaymentId,
          paidAt: input.paidAt,
          invoiceNumber,
        },
      });

      let subscription: any;
      let creditsAdded: number;

      if (payment.type === 'PLAN_UPGRADE') {
        const plan = await tx.plan.findUnique({ where: { code: payment.planCode } });
        const current = await tx.subscription.findFirst({
          where: { coachingId: payment.coachingId, isActive: true },
          orderBy: { createdAt: 'desc' },
        });
        // Renewing an active paid period extends it; otherwise the new period starts now
        const start =
          current?.status === SubscriptionStatus.ACTIVE && current.currentPeriodEnd > input.paidAt
            ? current.currentPeriodEnd
            : input.paidAt;
        const data = {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: start,
          currentPeriodEnd: periodEnd(start, payment.billingCycle as BillingCycle),
          gracePeriodEndsAt: null,
        };
        subscription = current
          ? await tx.subscription.update({ where: { id: current.id }, data, include: { plan: true } })
          : await tx.subscription.create({
              data: { ...data, coachingId: payment.coachingId, trialEndsAt: input.paidAt },
              include: { plan: true },
            });
        creditsAdded = plan.defaultCredits ?? 0;
      } else {
        creditsAdded = payment.credits ?? 0;
      }

      let walletBalance = 0;
      if (creditsAdded > 0) {
        const wallet = await tx.aiCreditWallet.upsert({
          where: { coachingId: payment.coachingId },
          create: { coachingId: payment.coachingId, balance: creditsAdded, totalAllocated: creditsAdded },
          update: { balance: { increment: creditsAdded }, totalAllocated: { increment: creditsAdded } },
        });
        walletBalance = wallet.balance;
      }

      return { kind: 'settled', payment: settled, subscription, creditsAdded, walletBalance } as const;
    }, MONEY_TRANSACTION);
  }
}
