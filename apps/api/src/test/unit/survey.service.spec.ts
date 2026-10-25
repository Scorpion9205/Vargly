import { beforeEach, describe, expect, it } from 'vitest';
import {
  answerSchema,
  averageOf,
  distributionOf,
  ISurveyRepository,
  InviteRow,
  SurveyService,
  webLink,
} from '../../modules/surveys/survey.service.js';

class FakeRepository implements ISurveyRepository {
  public surveys: any[] = [];
  public invites: Array<InviteRow & { token: string; surveyId: string; id: string }> = [];
  public parents = [
    { id: 'p1', name: 'Mrs Verma', phone: '9876543210' },
    { id: 'p2', name: 'Mr Khan', phone: '9123456780' },
  ];
  public async findParents(batchId: string | undefined) {
    return batchId === 'empty' ? [] : this.parents;
  }
  public async batchName(batchId: string) {
    return batchId === 'b1' ? 'Class 10 A' : null;
  }
  public async createWithInvites(survey: any, invites: Array<{ parentId: string; token: string }>) {
    const created = { id: `s${this.surveys.length + 1}`, createdAt: new Date('2026-10-20T05:00:00Z'), closedAt: null, sentCount: invites.length, batchId: survey.batchId ?? null, ...survey };
    this.surveys.push(created);
    for (const invite of invites) {
      this.invites.push({ ...invite, id: `i-${invite.token}`, surveyId: created.id, rating: null, comment: null, respondedAt: null });
    }
    return { id: created.id, createdAt: created.createdAt };
  }
  public async list() {
    return this.surveys;
  }
  public async invitesOf(surveyId: string) {
    return this.invites.filter((i) => i.surveyId === surveyId);
  }
  public async findSurvey(id: string) {
    return this.surveys.find((s) => s.id === id) ?? null;
  }
  public async parentNames(ids: string[]) {
    return new Map(this.parents.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.name]));
  }
  public async close(id: string) {
    this.surveys.find((s) => s.id === id).closedAt = new Date();
  }
  public async findByToken(token: string) {
    const invite = this.invites.find((i) => i.token === token);
    if (!invite) return null;
    const survey = this.surveys.find((s) => s.id === invite.surveyId);
    return {
      inviteId: invite.id,
      surveyId: survey.id,
      coachingId: survey.coachingId,
      title: survey.title,
      question: survey.question,
      instituteName: 'Sharma Classes',
      answered: invite.respondedAt !== null,
      closed: survey.closedAt !== null,
    };
  }
  public async answer(inviteId: string, _coachingId: string, answer: { rating: number; comment?: string }) {
    const invite = this.invites.find((i) => i.id === inviteId)!;
    if (invite.respondedAt) return false;
    Object.assign(invite, { rating: answer.rating, comment: answer.comment ?? null, respondedAt: new Date('2026-10-21T05:00:00Z') });
    return true;
  }
}

describe('SurveyService', () => {
  let repo: FakeRepository;
  let events: any[];
  let service: SurveyService;
  beforeEach(() => {
    repo = new FakeRepository();
    events = [];
    service = new SurveyService(repo, { publish: async (e: any) => void events.push(e) } as any);
  });

  it('makes one private link per parent and queues them all in one event', async () => {
    const survey = await service.create({ title: 'October feedback' }, 'c1', 'u1');
    expect(survey).toMatchObject({ sent: 2, answered: 0, averageRating: null, closed: false });
    expect(repo.invites).toHaveLength(2);
    expect(new Set(repo.invites.map((i) => i.token)).size).toBe(2);
    expect(repo.invites[0]!.token.length).toBeGreaterThanOrEqual(30);

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('SurveyOpened');
    const sent = events[0].payload.invites;
    expect(sent.map((i: any) => i.phone)).toEqual(['9876543210', '9123456780']);
    expect(sent[0].link).toBe(webLink(sent[0].token));
  });

  it('does not send a survey nobody can receive, nor to an unknown batch', async () => {
    await expect(service.create({ title: 'Empty one', batchId: 'empty' }, 'c1')).rejects.toMatchObject({ code: 'BATCH_NOT_FOUND' });
    repo.parents = [];
    await expect(service.create({ title: 'Nobody here' }, 'c1')).rejects.toMatchObject({ code: 'NO_PARENTS' });
    expect(events).toHaveLength(0);
  });

  it('takes a parent answer once and shows it to the owner', async () => {
    await service.create({ title: 'October feedback' }, 'c1');
    const [first, second] = repo.invites;

    expect(await service.publicSurvey(first!.token)).toMatchObject({ instituteName: 'Sharma Classes', answered: false, closed: false });
    await service.submit(first!.token, { rating: 5, comment: 'Great teachers' });
    await service.submit(second!.token, { rating: 3 });
    await expect(service.submit(first!.token, { rating: 1 })).rejects.toMatchObject({ code: 'ALREADY_ANSWERED' });
    expect((await service.publicSurvey(first!.token))?.answered).toBe(true);

    const detail = await service.detail('s1');
    expect(detail).toMatchObject({ sent: 2, answered: 2, averageRating: 4 });
    expect(detail.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 });
    expect(detail.responses).toHaveLength(2);
    expect(detail.responses.map((r) => r.comment)).toContain('Great teachers');
  });

  it('stops taking answers once the survey is closed, and knows no unknown link', async () => {
    await service.create({ title: 'October feedback' }, 'c1');
    await service.close('s1');
    await expect(service.submit(repo.invites[0]!.token, { rating: 4 })).rejects.toMatchObject({ code: 'SURVEY_CLOSED' });
    await expect(service.submit('x'.repeat(30), { rating: 4 })).rejects.toMatchObject({ code: 'LINK_NOT_FOUND' });
    expect(await service.publicSurvey('x'.repeat(30))).toBeNull();
  });

  it('lists surveys with how many answered and the average', async () => {
    await service.create({ title: 'October feedback' }, 'c1');
    await service.submit(repo.invites[0]!.token, { rating: 4 });
    const [summary] = await service.list();
    expect(summary).toMatchObject({ title: 'October feedback', sent: 2, answered: 1, averageRating: 4 });
  });
});

describe('ratings', () => {
  it('averages to one decimal and counts each rating', () => {
    expect(averageOf([])).toBeNull();
    expect(averageOf([5, 4, 4])).toBe(4.3);
    expect(distributionOf([5, 5, 1])).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 2 });
  });
  it('accepts only whole ratings from 1 to 5', () => {
    expect(() => answerSchema.parse({ rating: 0 })).toThrow();
    expect(() => answerSchema.parse({ rating: 6 })).toThrow();
    expect(() => answerSchema.parse({ rating: 3.5 })).toThrow();
    expect(answerSchema.parse({ rating: 4, comment: '  Good  ' })).toEqual({ rating: 4, comment: 'Good' });
  });
});
