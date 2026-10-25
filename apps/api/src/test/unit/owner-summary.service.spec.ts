import { describe, expect, it } from 'vitest';
import {
  hasNews,
  IOwnerSummaryRepository,
  OwnerSummaryService,
  OwnerSummaryStats,
} from '../../modules/owner-summary/owner-summary.service.js';

class FakeRepository implements IOwnerSummaryRepository {
  public asked: string[] = [];
  public constructor(
    private readonly coachings: Array<{ id: string; name: string }>,
    private readonly stats: Record<string, OwnerSummaryStats | Error>,
  ) {}
  public async listActiveCoachings(afterId: string | undefined) {
    return afterId ? [] : this.coachings;
  }
  public async statsFor(coachingId: string, today: string) {
    this.asked.push(`${coachingId}@${today}`);
    const result = this.stats[coachingId]!;
    if (result instanceof Error) throw result;
    return result;
  }
}

const quiet: OwnerSummaryStats = { absentYesterday: 0, overdueCount: 0, overdueAmount: 0, callsDue: 0 };

describe('OwnerSummaryService', () => {
  it('says something only when there is news', () => {
    expect(hasNews(quiet)).toBe(false);
    expect(hasNews({ ...quiet, callsDue: 1 })).toBe(true);
    expect(hasNews({ ...quiet, overdueCount: 2, overdueAmount: 3000 })).toBe(true);
  });

  it('queues one summary for each institute with news, for the India day', async () => {
    const events: any[] = [];
    const repository = new FakeRepository(
      [
        { id: 'c1', name: 'Sharma' },
        { id: 'c2', name: 'Quiet' },
      ],
      { c1: { absentYesterday: 3, overdueCount: 5, overdueAmount: 12500, callsDue: 2 }, c2: quiet },
    );
    const service = new OwnerSummaryService(repository, { publish: async (e: any) => void events.push(e) } as any);

    // 19:00 UTC on the 19th is already the 20th in India
    const sent = await service.runDaily(new Date('2026-10-19T19:00:00Z'));

    expect(sent).toBe(1);
    expect(repository.asked).toEqual(['c1@2026-10-20', 'c2@2026-10-20']);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('OwnerSummaryReady');
    expect(events[0].payload).toEqual({
      coachingId: 'c1',
      date: '2026-10-20',
      absentYesterday: 3,
      overdueCount: 5,
      overdueAmount: 12500,
      callsDue: 2,
    });
  });

  it('carries on with the other institutes when one fails', async () => {
    const events: any[] = [];
    const repository = new FakeRepository(
      [
        { id: 'bad', name: 'Bad' },
        { id: 'good', name: 'Good' },
      ],
      { bad: new Error('db blip'), good: { ...quiet, callsDue: 1 } },
    );
    const service = new OwnerSummaryService(repository, { publish: async (e: any) => void events.push(e) } as any);
    expect(await service.runDaily()).toBe(1);
    expect(events[0].payload.coachingId).toBe('good');
  });
});
