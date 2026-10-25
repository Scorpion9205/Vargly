'use client';

import { useSession } from '@/lib/auth/use-session';
import { PasswordForm } from './password-form';

/** /student/password: required after a first sign-in, and open to anyone who wants to change theirs */
export function FirstPassword() {
  const first = Boolean(useSession()?.user.mustChangePassword);
  return <PasswordForm first={first} />;
}
