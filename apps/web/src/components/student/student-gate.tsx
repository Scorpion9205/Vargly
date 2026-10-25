'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useSession } from '@/lib/auth/use-session';

export const PASSWORD_PATH = '/student/password';

/**
 * A student signing in with a temporary password may do one thing: choose their own. Until
 * they have, every page sends them to that form (the API refuses everything else as well).
 */
export function StudentGate({ children }: { children: ReactNode }) {
  const user = useSession()?.user;
  const pathname = usePathname();
  const router = useRouter();
  const mustChange = Boolean(user?.mustChangePassword);
  const detour = mustChange && pathname !== PASSWORD_PATH;

  useEffect(() => {
    if (detour) router.replace(PASSWORD_PATH);
  }, [detour, router]);

  return detour ? null : children;
}
