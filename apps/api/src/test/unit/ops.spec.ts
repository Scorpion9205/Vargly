import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { RoleType } from '@vargly/types';
import { OpsAlertService, type AlertState } from '../../modules/ops/ops-alert.service.js';
import { OpsService } from '../../modules/ops/ops.service.js';
import type { IOpsRepository, OpenIssueIds } from '../../modules/ops/ops.repository.js';
import { requireSuperAdmin } from '../../common/decorators/require-super-admin.decorator.js';
import { RequestContextService } from '../../common/services/request-context.service.js';

class FakeAlertState implements AlertState {
  public values = new Map<string, string>();
  public async get(key: string) {
    return this.values.get(key) ?? null;
  }
  public async set(key: string, value: string) {
    this.values.set(key, value);
  }
  public async del(key: string) {
    this.values.delete(key);
  }
}

function fakeRepository(overrides: Partial<IOpsRepository> = {}): IOpsRepository {
  return {
    counts: vi.fn(),
    listEvents: vi.fn().mockResolvedValue([]),
    retryDeadEvent: vi.fn().mockResolvedValue(true),
    listPaymentsNeedingReview: vi.fn().mockResolvedValue([]),
    resolvePayment: vi.fn().mockResolvedValue(true),
    openIssueIds: vi.fn().mockResolvedValue({ deadEventIds: [], reviewPaymentIds: [] }),
    ...overrides,
  };
}

describe('OpsAlertService', () => {
  let issues: OpenIssueIds;
  let state: FakeAlertState;
  let sendEmail: ReturnType<typeof vi.fn>;
  let recipient: string | undefined;
  let alert: OpsAlertService;

  beforeEach(() => {
    issues = { deadEventIds: [], reviewPaymentIds: [] };
    state = new FakeAlertState();
    sendEmail = vi.fn().mockResolvedValue({ status: 'SENT', providerMessageId: 'id' });
    recipient = 'ops@vargly.test';
    alert = new OpsAlertService(
      fakeRepository({ openIssueIds: vi.fn(async () => issues) }),
      { sendEmail },
      () => state,
      () => recipient,
      () => 'https://app.vargly.test/app/admin',
    );
  });

  it('sends nothing while nothing needs attention', async () => {
    expect(await alert.check()).toEqual({ dead: 0, review: 0, emailed: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('emails once for a set of problems and stays quiet on the next checks', async () => {
    issues = { deadEventIds: ['e1'], reviewPaymentIds: ['p1'] };

    expect((await alert.check()).emailed).toBe(true);
    expect((await alert.check()).emailed).toBe(false);
    expect((await alert.check()).emailed).toBe(false);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: 'ops@vargly.test',
      subject: '[Vargly] 1 payment(s) and 1 event(s) need attention',
    });
    expect(sendEmail.mock.calls[0][0].textBody).toContain('https://app.vargly.test/app/admin');
  });

  it('emails again when a new problem appears, and again after everything was cleared', async () => {
    issues = { deadEventIds: ['e1'], reviewPaymentIds: [] };
    await alert.check();

    issues = { deadEventIds: ['e1', 'e2'], reviewPaymentIds: [] };
    expect((await alert.check()).emailed).toBe(true);

    issues = { deadEventIds: [], reviewPaymentIds: [] };
    await alert.check();
    issues = { deadEventIds: ['e1', 'e2'], reviewPaymentIds: [] };
    expect((await alert.check()).emailed).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });

  it('retries on the next check when the email could not be sent', async () => {
    issues = { deadEventIds: [], reviewPaymentIds: ['p1'] };
    sendEmail.mockResolvedValueOnce({ status: 'FAILED', providerMessageId: '', errorMessage: 'smtp down' });

    expect((await alert.check()).emailed).toBe(false);
    expect((await alert.check()).emailed).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('does not email anyone, or fail, when no recipient is configured', async () => {
    recipient = undefined;
    issues = { deadEventIds: ['e1'], reviewPaymentIds: [] };

    expect(await alert.check()).toEqual({ dead: 1, review: 0, emailed: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('requireSuperAdmin', () => {
  const run = (roles: RoleType[], permissions: string[]) => {
    const next = vi.fn();
    const call = () =>
      RequestContextService.run(
        { traceId: 't', userId: 'u', roles, permissions, features: [] },
        () => requireSuperAdmin({} as Request, {} as Response, next),
      );
    return { next, call };
  };

  it('lets a platform administrator through', () => {
    const { next, call } = run([RoleType.SUPER_ADMIN], ['*']);
    call();
    expect(next).toHaveBeenCalled();
  });

  it('refuses an institute owner even though owners hold the "*" permission', () => {
    const { next, call } = run([RoleType.OWNER], ['*', 'billing:manage']);
    expect(call).toThrowError(expect.objectContaining({ code: 'FORBIDDEN', statusCode: 403 }));
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a request with no roles', () => {
    const { call } = run([], []);
    expect(call).toThrowError(expect.objectContaining({ statusCode: 403 }));
  });
});

describe('OpsService', () => {
  it('reports a missing or already-handled event as not retryable', async () => {
    const service = new OpsService(fakeRepository({ retryDeadEvent: vi.fn().mockResolvedValue(false) }));
    await expect(service.retryEvent('e1', 'admin')).rejects.toMatchObject({
      code: 'EVENT_NOT_RETRYABLE',
      statusCode: 404,
    });
  });

  it('refuses to resolve a payment that is not waiting for review', async () => {
    const service = new OpsService(fakeRepository({ resolvePayment: vi.fn().mockResolvedValue(false) }));
    await expect(service.resolvePayment('p1', 'refunded in Razorpay', 'admin')).rejects.toMatchObject({
      code: 'PAYMENT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('shows the amount the order was priced at in rupees, with the institute', async () => {
    const service = new OpsService(
      fakeRepository({
        listPaymentsNeedingReview: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            gatewayOrderId: 'order_1',
            gatewayPaymentId: 'pay_1',
            type: 'AI_CREDITS',
            planCode: null,
            credits: 500,
            amountPaise: 50000,
            reviewNote: 'Order expected 500.00 INR but 1.00 INR was paid',
            createdAt: new Date(0),
            updatedAt: new Date(0),
            coaching: { id: 'c1', name: 'Star Classes', code: 'STAR', email: null, phone: null },
          },
        ]),
      }),
    );

    const [row] = await service.listPaymentsNeedingReview();
    expect(row).toMatchObject({ orderId: 'order_1', expectedAmount: 500, coaching: { name: 'Star Classes' } });
  });
});
