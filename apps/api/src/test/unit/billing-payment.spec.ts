import { describe, it, expect, beforeEach } from 'vitest';
import { BillingService } from '../../modules/billing/billing.service.js';
import { InMemoryBillingRepository } from '../fakes/in-memory-billing.repository.js';
import { MockPaymentGatewayAdapter } from '../../modules/billing/adapters/mock-payment-gateway.adapter.js';
import { EventBus } from '../../events/event-bus.js';
import { PlanCode, SubscriptionStatus } from '@vargly/types';

describe('Subscription payment gateway & webhook lifecycle', () => {
  let billingRepo: InMemoryBillingRepository;
  let eventBus: EventBus;
  let paymentAdapter: MockPaymentGatewayAdapter;
  let billingService: BillingService;

  const coachingId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    billingRepo = new InMemoryBillingRepository();
    eventBus = new EventBus();
    paymentAdapter = new MockPaymentGatewayAdapter();

    billingService = new BillingService(billingRepo, eventBus, paymentAdapter);
  });

  describe('BillingService Payment Integration', () => {
    const paidWebhook = (orderId: string, amountPaise: number, paymentId = 'pay_test_123') => ({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: paymentId, order_id: orderId, amount: amountPaise, notes: { coachingId } },
        },
      },
    });

    it('settles a paid plan upgrade order: plan, period and plan credits', async () => {
      const order = await billingService.createOrder(
        { type: 'PLAN_UPGRADE', planCode: PlanCode.PRO_AI, billingCycle: 'MONTHLY' },
        coachingId,
      );

      const result = await billingService.handleWebhook(paidWebhook(order.orderId, 199900), 'any-signature');
      expect(result.status).toBe('PROCESSED');

      const sub = await billingRepo.findCurrentSubscription(coachingId);
      expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
      expect(sub.plan.code).toBe(PlanCode.PRO_AI);
      expect((await billingRepo.getCreditWallet(coachingId)).balance).toBe(500);
      expect(billingRepo.payments.get(order.orderId)).toMatchObject({
        status: 'PAID',
        gatewayPaymentId: 'pay_test_123',
        invoiceNumber: expect.stringMatching(/^INV\/\d{4}-\d{2}\/\d{5}$/),
      });
    });

    it('marks mock orders so the web app does not open a checkout', async () => {
      const order = await billingService.createOrder({ type: 'AI_CREDITS', credits: 10 }, coachingId);
      expect(order.mock).toBe(true);
    });

    it('can simulate paying an order in development, then lists it with its invoice', async () => {
      const order = await billingService.createOrder(
        { type: 'PLAN_UPGRADE', planCode: PlanCode.PRO_AI, billingCycle: 'YEARLY' },
        coachingId,
      );
      expect(await billingService.listPayments(coachingId)).toEqual([]);

      expect(await billingService.simulatePayment(order.orderId, coachingId)).toEqual({
        status: 'PROCESSED',
      });
      expect((await billingRepo.findCurrentSubscription(coachingId)).status).toBe(
        SubscriptionStatus.ACTIVE,
      );
      const [payment] = await billingService.listPayments(coachingId);
      expect(payment).toMatchObject({
        type: 'PLAN_UPGRADE',
        status: 'PAID',
        planCode: PlanCode.PRO_AI,
        billingCycle: 'YEARLY',
        amount: 19990,
        invoiceNumber: expect.stringMatching(/^INV\//),
      });
    });

    it("refuses to simulate another coaching's order", async () => {
      const order = await billingService.createOrder({ type: 'AI_CREDITS', credits: 10 }, coachingId);
      await expect(
        billingService.simulatePayment(order.orderId, '22222222-2222-2222-2222-222222222222'),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });

    it('applies a replayed or paired webhook only once', async () => {
      const order = await billingService.createOrder({ type: 'AI_CREDITS', credits: 300 }, coachingId);
      const webhook = paidWebhook(order.orderId, 30000);

      expect((await billingService.handleWebhook(webhook, 'any-signature')).status).toBe('PROCESSED');
      expect((await billingService.handleWebhook(webhook, 'any-signature')).status).toBe('DUPLICATE');
      const orderPaid = {
        event: 'order.paid',
        payload: { ...webhook.payload, order: { entity: { id: order.orderId, notes: { coachingId } } } },
      };
      expect((await billingService.handleWebhook(orderPaid, 'any-signature')).status).toBe('DUPLICATE');

      expect((await billingRepo.getCreditWallet(coachingId)).balance).toBe(300);
    });

    it('refuses to apply an order when the paid amount differs from its price', async () => {
      const order = await billingService.createOrder({ type: 'AI_CREDITS', credits: 1000 }, coachingId);
      const result = await billingService.handleWebhook(paidWebhook(order.orderId, 100), 'any-signature');

      expect(result.status).toBe('REJECTED');
      expect((await billingRepo.getCreditWallet(coachingId)).balance).toBe(0);
      // The payment is kept for a person to resolve, not only logged
      expect(billingRepo.payments.get(order.orderId)).toMatchObject({
        status: 'NEEDS_REVIEW',
        gatewayPaymentId: 'pay_test_123',
        reviewNote: expect.stringContaining('expected 1000.00 INR but 1.00 INR'),
      });
      // A gateway retry of the same webhook does not flag or apply it again
      expect((await billingService.handleWebhook(paidWebhook(order.orderId, 100), 'any-signature')).status).toBe('DUPLICATE');
    });

    it('grants nothing for a signed payment that has no matching order (no more notes-driven upgrades)', async () => {
      const forged = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_x',
              order_id: 'order_never_created',
              amount: 100,
              notes: { coachingId, type: 'PLAN_UPGRADE', planCode: PlanCode.PRO_AI, billingCycle: 'YEARLY' },
            },
          },
        },
      };
      expect((await billingService.handleWebhook(forged, 'any-signature')).status).toBe('IGNORED');
      expect(await billingRepo.findCurrentSubscription(coachingId)).toBeNull();
    });
  });
});
