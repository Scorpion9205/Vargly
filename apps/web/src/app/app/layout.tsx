import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { RoleGuard } from '@/components/auth/role-guard';
import { SessionGate } from '@/components/auth/session-gate';

// Signed-in pages are per-user: never indexed, never cached as static HTML
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SessionGate>
      <RoleGuard area="staff">
        <AppShell>{children}</AppShell>
      </RoleGuard>
    </SessionGate>
  );
}
