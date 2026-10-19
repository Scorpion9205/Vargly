import { __setSessionForTests } from '@/lib/auth/session';
import type { Session, SessionUser } from '@/lib/auth/types';

// Permission sets as seeded by apps/api init-rbac.ts
export const OWNER: SessionUser = {
  id: 'owner-1',
  coachingId: 'c1',
  name: 'Asha Sharma',
  email: 'asha@example.com',
  phone: '9876543210',
  roles: ['OWNER'],
  permissions: ['*'],
};

export const TEACHER: SessionUser = {
  id: 'teacher-1',
  coachingId: 'c1',
  name: 'Ravi Kumar',
  email: 'ravi@example.com',
  phone: '9876500000',
  roles: ['TEACHER'],
  permissions: [
    'students:read',
    'batches:read',
    'attendance:create',
    'attendance:mark',
    'attendance:read',
    'tests:create',
    'tests:read',
    'homework:create',
    'homework:read',
    'homework:update',
    'homework:delete',
    'ai:generate',
    'notices:read',
    'dashboard:teacher',
  ],
};

// Vargly's own operator: belongs to no institute (permissions as seeded by create-super-admin.ts)
export const SUPER_ADMIN: SessionUser = {
  id: 'admin-1',
  name: 'Vargly Operator',
  email: 'ops@vargly.test',
  phone: '9000000000',
  roles: ['SUPER_ADMIN'],
  permissions: ['*'],
};

export function signInAs(user: SessionUser): Session {
  const session = { user, accessToken: `token-${user.id}`, expiresIn: 900 };
  __setSessionForTests(session);
  return session;
}
