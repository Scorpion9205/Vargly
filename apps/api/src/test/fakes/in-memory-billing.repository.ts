import { PlanCode, SubscriptionStatus } from '@vargly/types';
import {
  CreateBillingPaymentInput,
  IBillingRepository,
  mismatchNote,
  SettlePaymentInput,
  SettlePaymentResult,
} from '../../modules/billing/billing.repository.js';

/**
 * In-memory billing repository that follows the real settlement rules: an order settles at
 * most once, only for the price recorded when it was created.
 */
export class InMemoryBillingRepository implements IBillingRepository {
  public subscriptions = new Map<string, any>();
  public plans = new Map<string, any>();
  public wallets = new Map<string, any>();
  public payments = new Map<string, any>();
  private invoiceCounter = 0;

  public constructor() {
    const plan = (code: PlanCode, priceMonthly: number, priceYearly: number, defaultCredits: number) => ({
      id: `plan-${code}`,
      code,
      name: code,
      priceMonthly,
      priceYearly,
      defaultFeatures: ['*'],
      defaultCredits,
      isActive: true,
    });
    // ENTERPRISE is the free trial plan (as seeded), so it cannot be bought
    this.plans.set(PlanCode.ENTERPRISE, plan(PlanCode.ENTERPRISE, 0, 0, 1000));
    this.plans.set(PlanCode.PRO_AI, plan(PlanCode.PRO_AI, 1999, 19990, 500));
    this.plans.set(PlanCode.STARTER, plan(PlanCode.STARTER, 999, 9990, 100));
  }

  public async findCurrentSubscription(coachingId: string): Promise<any | null> {
    return this.subscriptions.get(coachingId) || null;
  }

  public async findPlanByCode(code: PlanCode): Promise<any | null> {
    return this.plans.get(code) || null;
  }

  public async findAllActivePlans(): Promise<any[]> {
    return [...this.plans.values()].filter((p) => p.isActive);
  }

  public async findExpiringSubscriptions(threshold: Date): Promise<any[]> {
    return [...this.subscriptions.values()].filter(
      (s) =>
        s.isActive &&
        ((s.status === SubscriptionStatus.TRIALING && new Date(s.trialEndsAt) <= threshold) ||
          (s.status === SubscriptionStatus.ACTIVE && new Date(s.currentPeriodEnd) <= threshold)),
    );
  }

  public async updateSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<any> {
    const sub = [...this.subscriptions.values()].find((s) => s.id === id);
    if (sub) sub.status = status;
    return sub ?? null;
  }

  public async getCreditWallet(coachingId: string): Promise<any | null> {
    return this.wallets.get(coachingId) ?? { id: `wallet-${coachingId}`, coachingId, balance: 0, totalAllocated: 0 };
  }

  public async createPaymentRecord(input: CreateBillingPaymentInput): Promise<any> {
    const record = { id: `bp-${this.payments.size + 1}`, status: 'CREATED', ...input };
    this.payments.set(input.gatewayOrderId, record);
    return record;
  }

  public async listPayments(coachingId: string, limit: number): Promise<any[]> {
    return [...this.payments.values()]
      .filter((p) => p.coachingId === coachingId && p.status !== 'CREATED')
      .reverse()
      .slice(0, limit);
  }

  public async findPaymentByOrderId(gatewayOrderId: string): Promise<any | null> {
    return this.payments.get(gatewayOrderId) ?? null;
  }

  public async settlePayment(input: SettlePaymentInput): Promise<SettlePaymentResult> {
    const payment = this.payments.get(input.gatewayOrderId);
    if (!payment) return { kind: 'not_found' };
    if (payment.status !== 'CREATED') return { kind: 'duplicate', payment };
    if (payment.amountPaise !== input.amountPaidPaise) {
      Object.assign(payment, {
        status: 'NEEDS_REVIEW',
        gatewayPaymentId: input.gatewayPaymentId,
        reviewNote: mismatchNote(payment.amountPaise, input),
      });
      return { kind: 'amount_mismatch', payment };
    }

    this.invoiceCounter++;
    Object.assign(payment, {
      status: 'PAID',
      gatewayPaymentId: input.gatewayPaymentId,
      paidAt: input.paidAt,
      invoiceNumber: `INV/2026-27/${String(this.invoiceCounter).padStart(5, '0')}`,
    });

    let subscription: any;
    let creditsAdded = payment.credits ?? 0;
    if (payment.type === 'PLAN_UPGRADE') {
      const plan = this.plans.get(payment.planCode);
      const end = new Date(input.paidAt);
      if (payment.billingCycle === 'YEARLY') end.setFullYear(end.getFullYear() + 1);
      else end.setMonth(end.getMonth() + 1);
      subscription = {
        ...(this.subscriptions.get(payment.coachingId) ?? { id: 'sub-new', coachingId: payment.coachingId, isActive: true }),
        planId: plan.id,
        plan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: input.paidAt,
        currentPeriodEnd: end,
      };
      this.subscriptions.set(payment.coachingId, subscription);
      creditsAdded = plan.defaultCredits;
    }

    const wallet = await this.getCreditWallet(payment.coachingId);
    const updated = {
      ...wallet,
      balance: wallet.balance + creditsAdded,
      totalAllocated: wallet.totalAllocated + creditsAdded,
    };
    this.wallets.set(payment.coachingId, updated);

    return { kind: 'settled', payment, subscription, creditsAdded, walletBalance: updated.balance };
  }
}
