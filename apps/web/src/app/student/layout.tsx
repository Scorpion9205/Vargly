import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RoleGuard } from '@/components/auth/role-guard';
import { SessionGate } from '@/components/auth/session-gate';
import { StudentGate } from '@/components/student/student-gate';
import { StudentShell } from '@/components/student/student-shell';

// The student panel is per-person: never indexed, never cached as static HTML
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // Installable on the phone's home screen
  manifest: '/student.webmanifest',
  appleWebApp: { capable: true, title: 'Vargly', statusBarStyle: 'default' },
  icons: { apple: '/icon-192.png' },
};
export const dynamic = 'force-dynamic';

export default function StudentLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SessionGate>
      <RoleGuard area="student">
        <StudentGate>
          <StudentShell>{children}</StudentShell>
        </StudentGate>
      </RoleGuard>
    </SessionGate>
  );
}
