import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The access policy, read from the route files themselves. A student signs in with one permission,
 * the portal's, so the only routes a student could reach are those that check no permission at all.
 * This lists them and fails when a new one appears, so opening a route to every signed-in person is
 * always a deliberate edit of the list below.
 */
const MODULES = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../modules');
const GUARDS = /requirePermission\(|requireSuperAdmin|requireStudent\(|denyStudents/;

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return /\.(routes|module)\.ts$/.test(entry.name) ? [full] : [];
  });
}

interface Found {
  readonly file: string;
  readonly method: string;
  readonly route: string;
  readonly signedIn: boolean;
  readonly guarded: boolean;
}

function scan(): Found[] {
  const found: Found[] = [];
  for (const file of routeFiles(MODULES).sort()) {
    const text = fs.readFileSync(file, 'utf8');
    // A file can build more than one router (a staff one and a public one): each is read on its own,
    // from where it is created, by the name it is held under
    const created = [...text.matchAll(/const\s+(\w+)\s*=\s*createRouter\(\)/g)].map((m) => ({ name: m[1]!, at: m.index ?? 0 }));
    const owner = (at: number) => [...created].reverse().find((c) => c.at < at);

    const uses = [...text.matchAll(/(\w+)\.use\(([^;]*?)\);/gs)]
      .filter((m) => created.some((c) => c.name === m[1]))
      .map((m) => ({
        name: m[1]!,
        at: m.index ?? 0,
        guarded: GUARDS.test(m[2]!),
        signedIn: /authenticateMiddleware/.test(m[2]!),
      }));

    for (const m of text.matchAll(/(\w+)\.(get|post|put|delete|patch)\(/g)) {
      const at = m.index ?? 0;
      const router = owner(at);
      if (!router || router.name !== m[1]) continue;
      let depth = 1;
      let i = at + m[0].length;
      while (i < text.length && depth > 0) {
        if (text[i] === '(') depth += 1;
        else if (text[i] === ')') depth -= 1;
        i += 1;
      }
      const call = text.slice(at, i);
      const mine = uses.filter((u) => u.name === router.name && u.at > router.at && u.at < at);
      found.push({
        file: path.relative(MODULES, file).split(path.sep).join('/'),
        method: m[2]!.toUpperCase(),
        route: /\(\s*'([^']*)'/.exec(call)?.[1] ?? '?',
        signedIn: mine.some((u) => u.signedIn) || /authenticateMiddleware/.test(call),
        guarded: mine.some((u) => u.guarded) || GUARDS.test(call),
      });
    }
  }
  return found;
}

const label = (r: Found) => `${r.method} ${r.file} ${r.route}`;

describe('route access policy', () => {
  const routes = scan();

  it('finds the routes (so an empty scan cannot pass for a clean one)', () => {
    expect(routes.length).toBeGreaterThan(150);
    expect(routes.some((r) => r.file.startsWith('fees/') && r.route === '/pay')).toBe(true);
  });

  it('opens a route to every signed-in person only when it is listed here', () => {
    const open = routes.filter((r) => r.signedIn && !r.guarded).map(label).sort();
    expect(open).toEqual([
      // a person's own account: students sign out, change their password and see who they are
      'GET auth/auth.routes.ts /me',
      'POST auth/auth.routes.ts /change-password',
      'POST auth/auth.routes.ts /logout-all',
    ]);
  });

  it('has public routes only where they are meant to be (parents have no login)', () => {
    const open = routes.filter((r) => !r.signedIn).map(label).sort();
    expect(open).toEqual([
      'GET billing/billing.routes.ts /plans',
      'GET enquiries/enquiry.routes.ts /:code',
      'GET fees/fee.routes.ts /receipt/:id/:sig',
      'GET notifications/notification.routes.ts /webhook',
      'GET papers/paper.routes.ts /dl/:token',
      'GET storage/storage.routes.ts /files/*',
      'GET surveys/survey.module.ts /:token',
      'POST auth/auth.routes.ts /forgot-password',
      'POST auth/auth.routes.ts /login',
      'POST auth/auth.routes.ts /logout',
      'POST auth/auth.routes.ts /refresh',
      'POST auth/auth.routes.ts /reset-password',
      'POST auth/auth.routes.ts /send-otp',
      'POST auth/auth.routes.ts /verify-email',
      'POST auth/auth.routes.ts /verify-otp',
      'POST billing/billing.routes.ts /webhook',
      'POST coaching/coaching.routes.ts /register',
      'POST enquiries/enquiry.routes.ts /:code',
      'POST notifications/notification.routes.ts /webhook',
      'POST surveys/survey.module.ts /:token',
    ]);
  });
});
