/**
 * Creates (or re-enables) a Vargly platform administrator: the operator who sees the console at
 * /app/admin. There is deliberately no sign-up route for this role, so it is created from the
 * command line by someone with database access:
 *
 *   SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='a long passphrase' \
 *     SUPER_ADMIN_NAME='Your Name' SUPER_ADMIN_PHONE=+919999999999 \
 *     pnpm --filter @vargly/api admin:create:dev
 *
 * Use an email no institute owner uses: sign-in without an institute code refuses an email that
 * matches more than one account.
 */
import { RoleType } from '@vargly/types';
import { PasswordService } from '../common/security/password.service.js';
import { RequestContextService } from '../common/services/request-context.service.js';
import { getPrismaClient } from '../database/prisma/tenant-prisma.extension.js';

const MIN_PASSWORD_LENGTH = 12;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const email = required('SUPER_ADMIN_EMAIL').toLowerCase();
  const password = required('SUPER_ADMIN_PASSWORD');
  const name = process.env.SUPER_ADMIN_NAME?.trim() || 'Vargly Administrator';
  const phone = process.env.SUPER_ADMIN_PHONE?.trim() || '+910000000000';
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`SUPER_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const db = getPrismaClient() as any;
  const passwordHash = await PasswordService.getInstance().hash(password);

  await RequestContextService.runAsSystem('admin:create-super-admin', async () => {
    // The role needs the "*" permission; npm run db:seed:rbac creates it
    const wildcard = await db.permission.findUnique({ where: { code: '*' } });
    if (!wildcard) throw new Error('Permissions are not seeded; run db:seed:rbac first');

    let role = await db.role.findFirst({ where: { code: RoleType.SUPER_ADMIN, coachingId: null } });
    role ??= await db.role.create({
      data: {
        name: 'Platform Administrator',
        code: RoleType.SUPER_ADMIN,
        description: 'Vargly operator: platform-wide console, no institute',
        isSystem: true,
      },
    });
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: wildcard.id } },
      update: {},
      create: { roleId: role.id, permissionId: wildcard.id },
    });

    // users.coaching_id is nullable, so (coaching_id, email) is not unique for platform users
    const existing = await db.user.findFirst({ where: { coachingId: null, email, deletedAt: null } });
    const user = existing
      ? await db.user.update({
          where: { id: existing.id },
          data: { passwordHash, isActive: true, name, phone, failedLogins: 0, lockedUntil: null },
        })
      : await db.user.create({
          data: { coachingId: null, name, email, phone, passwordHash, emailVerifiedAt: new Date() },
        });

    const linked = await db.userRole.findFirst({
      where: { userId: user.id, roleId: role.id, coachingId: null },
    });
    if (!linked) await db.userRole.create({ data: { userId: user.id, roleId: role.id, coachingId: null } });

    console.log(`${existing ? 'Updated' : 'Created'} platform administrator ${email}`);
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => (getPrismaClient() as any).$disconnect());
