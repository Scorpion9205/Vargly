import { describe, expect, it } from 'vitest';
import { loginSchema } from '../../modules/auth/validators/auth.validator.js';
import {
  emailForStudentId,
  generateStudentId,
  generateTemporaryPassword,
  isStudentLoginEmail,
  loginIdentifierToEmail,
  studentIdFromEmail,
} from '../../common/security/student-login.js';
import {
  BULK_LIMIT,
  IStudentLoginRepository,
  StudentForLogin,
  StudentLoginService,
} from '../../modules/student-logins/student-login.service.js';

describe('Student ID and temporary password', () => {
  it('makes a readable ID from the first name, and a fallback for a name with no Latin letters', () => {
    expect(generateStudentId('Riya')).toMatch(/^RIYA-\d{4}$/);
    expect(generateStudentId('Aarav-Krishnamurthy')).toMatch(/^AARAVKRI-\d{4}$/);
    expect(generateStudentId('रिया')).toMatch(/^STU-\d{4}$/);
  });

  it('turns an ID into the account email and back', () => {
    expect(emailForStudentId('RIYA-4821')).toBe('riya-4821@students.vargly.local');
    expect(studentIdFromEmail('riya-4821@students.vargly.local')).toBe('RIYA-4821');
    expect(isStudentLoginEmail('riya-4821@students.vargly.local')).toBe(true);
    expect(isStudentLoginEmail('teacher@school.in')).toBe(false);
  });

  it('makes passwords of ten characters with letters and digits, never the look-alikes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(10);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/\d/);
      expect(password).not.toMatch(/[01OIl]/);
      seen.add(password);
    }
    expect(seen.size).toBe(200);
  });
});

describe('sign-in box', () => {
  it('takes an email as it is, and a Student ID as the account it stands for', () => {
    expect(loginIdentifierToEmail('  Owner@Demo.In ')).toBe('owner@demo.in');
    expect(loginIdentifierToEmail('RIYA-4821')).toBe('riya-4821@students.vargly.local');
    expect(loginIdentifierToEmail('riya 4821')).toBe('riya 4821');
  });

  it('accepts either in the login request, and rejects what is neither', () => {
    expect(loginSchema.parse({ email: 'Owner@Demo.In', password: 'secret1' }).email).toBe('owner@demo.in');
    expect(loginSchema.parse({ email: 'RIYA-4821', password: 'secret1', coachingCode: 'sharma' }).email).toBe(
      'riya-4821@students.vargly.local',
    );
    expect(() => loginSchema.parse({ email: 'riya 4821', password: 'secret1' })).toThrow();
    expect(() => loginSchema.parse({ email: '', password: 'secret1' })).toThrow();
  });
});

class FakeRepository implements IStudentLoginRepository {
  public students = new Map<string, StudentForLogin>();
  public taken = new Set<string>();
  public created: Array<{ studentId: string; email: string; hash: string }> = [];
  public disabled: string[] = [];
  public reset: Array<{ userId: string; hash: string }> = [];
  public invalidated: string[] = [];

  public async findStudent(id: string) {
    return this.students.get(id) ?? null;
  }
  public async studentsWithoutLogin(_batchId: string | undefined, limit: number) {
    return [...this.students.values()].filter((s) => !s.userId && s.isActive).slice(0, limit);
  }
  public async list() {
    return [];
  }
  public async rowOf(studentId: string) {
    const s = this.students.get(studentId);
    return s ? { studentId, name: `${s.firstName} ${s.lastName}`, rollNumber: null, loginId: s.userId ? 'RIYA-4821' : null, active: true, lastLoginAt: null } : null;
  }
  public async emailTaken(email: string) {
    return this.taken.has(email);
  }
  public async loginIdOf(userId: string) {
    return `ID-OF-${userId}`;
  }
  public async createLogin(student: StudentForLogin, email: string, hash: string) {
    this.created.push({ studentId: student.id, email, hash });
    this.taken.add(email);
    this.students.set(student.id, { ...student, userId: `user-${student.id}` });
    return { userId: `user-${student.id}` };
  }
  public async resetLogin(userId: string, hash: string) {
    this.reset.push({ userId, hash });
  }
  public async disableLogin(userId: string) {
    this.disabled.push(userId);
  }
  public async invalidateAccess(userId: string) {
    this.invalidated.push(userId);
  }
}

const student = (id: string, overrides: Partial<StudentForLogin> = {}): StudentForLogin => ({
  id,
  coachingId: 'c1',
  firstName: 'Riya',
  lastName: 'Verma',
  phone: null,
  isActive: true,
  userId: null,
  ...overrides,
});

const passwords = { hash: async (plain: string) => `hashed:${plain}` };

function withEvents(repo: FakeRepository) {
  const events: any[] = [];
  return { events, service: new StudentLoginService(repo, passwords, { publish: async (e: any) => void events.push(e) } as any) };
}

describe('StudentLoginService', () => {
  it('makes a login: a fresh ID, a hashed temporary password, and the cache dropped', async () => {
    const repo = new FakeRepository();
    repo.students.set('s1', student('s1'));
    const issued = await new StudentLoginService(repo, passwords).create('s1');

    expect(issued).toMatchObject({ studentId: 's1', name: 'Riya Verma' });
    expect(issued.loginId).toMatch(/^RIYA-\d{4}$/);
    expect(issued.temporaryPassword).toHaveLength(10);
    expect(repo.created).toHaveLength(1);
    expect(repo.created[0]!.email).toBe(emailForStudentId(issued.loginId));
    // Only the hash is kept; the plain password is returned once and nowhere else
    expect(repo.created[0]!.hash).toBe(`hashed:${issued.temporaryPassword}`);
    expect(repo.invalidated).toEqual(['user-s1']);
  });

  it('never makes two logins for one student, nor one for a student who left or does not exist', async () => {
    const repo = new FakeRepository();
    repo.students.set('s1', student('s1', { userId: 'u1' }));
    repo.students.set('s2', student('s2', { isActive: false }));
    const service = new StudentLoginService(repo, passwords);

    await expect(service.create('s1')).rejects.toMatchObject({ code: 'LOGIN_EXISTS' });
    await expect(service.create('s2')).rejects.toMatchObject({ code: 'STUDENT_INACTIVE' });
    await expect(service.create('nobody')).rejects.toMatchObject({ code: 'STUDENT_NOT_FOUND' });
    expect(repo.created).toHaveLength(0);
  });

  it('picks another ID when one is taken', async () => {
    const repo = new FakeRepository();
    repo.students.set('s1', student('s1'));
    // Every ID but the retry is taken: the service must keep trying, then give up cleanly
    repo.emailTaken = async () => true;
    await expect(new StudentLoginService(repo, passwords).create('s1')).rejects.toMatchObject({ code: 'ID_UNAVAILABLE' });
  });

  it('makes logins for everyone who has none, at most the bulk limit, and says whether more are left', async () => {
    const repo = new FakeRepository();
    for (let i = 0; i < BULK_LIMIT + 5; i += 1) repo.students.set(`s${i}`, student(`s${i}`, { firstName: `Kid${i}` }));
    repo.students.set('has-login', student('has-login', { userId: 'u' }));

    const { issued, hasMore } = await new StudentLoginService(repo, passwords).createMany();
    expect(issued).toHaveLength(BULK_LIMIT);
    expect(hasMore).toBe(true);
    expect(new Set(issued.map((i) => i.loginId)).size).toBe(BULK_LIMIT);
  });

  it('resets to a new temporary password, and switches a login off', async () => {
    const repo = new FakeRepository();
    repo.students.set('s1', student('s1', { userId: 'u1' }));
    repo.students.set('s2', student('s2'));
    const service = new StudentLoginService(repo, passwords);

    const issued = await service.reset('s1');
    expect(issued).toMatchObject({ studentId: 's1', loginId: 'ID-OF-u1' });
    expect(repo.reset).toEqual([{ userId: 'u1', hash: `hashed:${issued.temporaryPassword}` }]);

    await service.disable('s1');
    expect(repo.disabled).toEqual(['u1']);
    expect(repo.invalidated).toEqual(['u1', 'u1']);

    await expect(service.reset('s2')).rejects.toMatchObject({ code: 'NO_LOGIN' });
    await expect(service.disable('s2')).rejects.toMatchObject({ code: 'NO_LOGIN' });
  });
});

describe('one student\'s login status', () => {
  it('says whether the student has a login, and refuses an unknown student', async () => {
    const repo = new FakeRepository();
    repo.students.set('s1', student('s1', { userId: 'u1' }));
    repo.students.set('s2', student('s2'));
    const service = new StudentLoginService(repo, passwords);
    expect((await service.status('s1')).loginId).toBe('RIYA-4821');
    expect((await service.status('s2')).loginId).toBeNull();
    await expect(service.status('nobody')).rejects.toMatchObject({ code: 'STUDENT_NOT_FOUND' });
  });
});

describe('the audit trail of student logins', () => {
  it('records who made, reset and switched off a login, and never the password', async () => {
    const repo = new FakeRepository();
    repo.students.set('s1', student('s1'));
    const { events, service } = withEvents(repo);

    const issued = await service.create('s1', 'owner-1');
    await service.reset('s1', 'owner-1');
    await service.disable('s1', 'owner-2');

    expect(events.map((e) => [e.eventName, e.payload.action, e.metadata.userId])).toEqual([
      ['StudentLoginChanged', 'CREATED', 'owner-1'],
      ['StudentLoginChanged', 'RESET', 'owner-1'],
      ['StudentLoginChanged', 'DISABLED', 'owner-2'],
    ]);
    expect(events[0].payload).toMatchObject({ coachingId: 'c1', studentId: 's1', loginId: issued.loginId });
    expect(JSON.stringify(events)).not.toContain(issued.temporaryPassword);
  });

  it('records nothing when the action is refused', async () => {
    const repo = new FakeRepository();
    repo.students.set('s1', student('s1', { userId: 'u1' }));
    const { events, service } = withEvents(repo);
    await expect(service.create('s1', 'owner-1')).rejects.toMatchObject({ code: 'LOGIN_EXISTS' });
    expect(events).toHaveLength(0);
  });
});
