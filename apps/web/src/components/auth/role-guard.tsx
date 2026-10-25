'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { homeFor, isStudent } from '@/lib/auth/roles';
import { useSession } from '@/lib/auth/use-session';

/**
 * Keeps each kind of person in their own part of the site: a student who opens the staff app is
 * sent to their panel, and a staff member who opens the panel is sent to the app. (The API
 * refuses the wrong area's data regardless; this only spares people a page full of errors.)
 */
export function RoleGuard({ area, children }: { area: 'staff' | 'student'; children: ReactNode }) {
  const user = useSession()?.user;
  const router = useRouter();
  const wrongArea = Boolean(user) && isStudent(user) !== (area === 'student');

  useEffect(() => {
    if (user && wrongArea) router.replace(homeFor(user));
  }, [user, wrongArea, router]);

  if (!user || wrongArea) return null;
  return children;
}
