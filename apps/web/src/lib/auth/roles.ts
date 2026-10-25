import { safeNextPath } from './redirect';
import type { SessionUser } from './types';

export const STUDENT_HOME = '/student';

export function isStudent(user: Pick<SessionUser, 'roles'> | null | undefined): boolean {
  return Boolean(user?.roles.includes('STUDENT'));
}

/**
 * Where a person lands after signing in: students in their own panel, everyone else in the app.
 * A page they were sent from is honoured only when it belongs to their own area.
 */
export function homeFor(user: Pick<SessionUser, 'roles'>, next?: string | null): string {
  const wanted = safeNextPath(next);
  if (isStudent(user)) return wanted.startsWith(`${STUDENT_HOME}`) ? wanted : STUDENT_HOME;
  return wanted.startsWith(STUDENT_HOME) ? safeNextPath(null) : wanted;
}

/** The Student ID a student account stands for: "riya-4821@students.vargly.local" gives "RIYA-4821" */
export function studentLoginId(user: Pick<SessionUser, 'email'>): string {
  return user.email.split('@')[0]!.toUpperCase();
}

/** What a person typed in the sign-in box: an email, or a Student ID (letters, digits and dashes) */
export function looksLikeLoginId(value: string): boolean {
  const text = value.trim();
  if (text.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  return /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(text);
}

export function isStudentIdInput(value: string): boolean {
  return !value.includes('@') && looksLikeLoginId(value);
}
