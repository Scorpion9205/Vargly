import { PrismaClient } from '@prisma/client';
import { PlanCode, RoleType } from '@vargly/types';

const prisma = new PrismaClient();

const ALL_PERMISSIONS = [
  { code: '*', module: 'system', action: 'all', description: 'Super-admin wildcard' },
  { code: 'students:create', module: 'students', action: 'create', description: 'Enroll new student' },
  { code: 'students:read', module: 'students', action: 'read', description: 'View student profiles' },
  { code: 'students:update', module: 'students', action: 'update', description: 'Update student profile' },
  { code: 'students:delete', module: 'students', action: 'delete', description: 'Deactivate/delete student' },
  { code: 'batches:create', module: 'batches', action: 'create', description: 'Create academic batch' },
  { code: 'batches:read', module: 'batches', action: 'read', description: 'View batches and rosters' },
  { code: 'batches:update', module: 'batches', action: 'update', description: 'Update batch details' },
  { code: 'batches:delete', module: 'batches', action: 'delete', description: 'Archive batch' },
  { code: 'attendance:create', module: 'attendance', action: 'create', description: 'Mark attendance session' },
  { code: 'attendance:mark', module: 'attendance', action: 'mark', description: 'Mark daily batch attendance' },
  { code: 'attendance:read', module: 'attendance', action: 'read', description: 'View attendance history' },
  { code: 'fees:create', module: 'fees', action: 'create', description: 'Create fee plans' },
  { code: 'fees:read', module: 'fees', action: 'read', description: 'View fee ledgers and reports' },
  { code: 'fees:pay', module: 'fees', action: 'pay', description: 'Record fee payment' },
  { code: 'fees:waive', module: 'fees', action: 'waive', description: 'Waive fee installment' },
  { code: 'tests:create', module: 'tests', action: 'create', description: 'Create test and enter marks' },
  { code: 'tests:read', module: 'tests', action: 'read', description: 'View tests and performance' },
  { code: 'homework:create', module: 'homework', action: 'create', description: 'Assign homework' },
  { code: 'homework:read', module: 'homework', action: 'read', description: 'View homework submissions' },
  { code: 'homework:update', module: 'homework', action: 'update', description: 'Update homework' },
  { code: 'homework:delete', module: 'homework', action: 'delete', description: 'Delete homework' },
  { code: 'teachers:create', module: 'teachers', action: 'create', description: 'Onboard teacher/faculty' },
  { code: 'teachers:read', module: 'teachers', action: 'read', description: 'View teacher profiles' },
  { code: 'teachers:update', module: 'teachers', action: 'update', description: 'Update teacher profile' },
  { code: 'reports:read', module: 'reports', action: 'read', description: 'View academic and revenue reports' },
  { code: 'ai:generate', module: 'ai', action: 'generate', description: 'Generate AI summaries and insights' },
  { code: 'settings:read', module: 'settings', action: 'read', description: 'View institute settings' },
  { code: 'settings:update', module: 'settings', action: 'update', description: 'Update institute settings' },
  { code: 'settings:manage', module: 'settings', action: 'manage', description: 'Manage institute configurations' },
  { code: 'salary:manage', module: 'salary', action: 'manage', description: 'Generate and manage faculty payroll' },
  { code: 'salary:pay', module: 'salary', action: 'pay', description: 'Disburse teacher salary payments' },
  { code: 'salary:read', module: 'salary', action: 'read', description: 'View salary slips and reports' },
  { code: 'expenses:create', module: 'expenses', action: 'create', description: 'Record operational expense' },
  { code: 'expenses:read', module: 'expenses', action: 'read', description: 'View institute expense reports' },
  { code: 'expenses:update', module: 'expenses', action: 'update', description: 'Modify recorded expense' },
  { code: 'expenses:delete', module: 'expenses', action: 'delete', description: 'Remove expense record' },
  { code: 'risk:read', module: 'risk', action: 'read', description: 'View student risk scores and alerts' },
  { code: 'risk:compute', module: 'risk', action: 'compute', description: 'Recompute student risk index' },
  { code: 'rbac:manage', module: 'rbac', action: 'manage', description: 'Assign roles and permissions' },
  { code: 'notifications:read', module: 'notifications', action: 'read', description: 'View notification delivery logs' },
  { code: 'notifications:retry', module: 'notifications', action: 'retry', description: 'Retry failed WhatsApp/Email notifications' },
  { code: 'notices:manage', module: 'notices', action: 'manage', description: 'Publish and edit notice board announcements' },
  { code: 'notices:read', module: 'notices', action: 'read', description: 'Read institute notices' },
  { code: 'data:import', module: 'import', action: 'import', description: 'Execute bulk data import' },
  { code: 'billing:read', module: 'billing', action: 'read', description: 'View subscription and invoices' },
  { code: 'billing:manage', module: 'billing', action: 'manage', description: 'Manage Vargly subscription plan' },
  { code: 'dashboard:owner', module: 'dashboard', action: 'owner', description: 'View owner business dashboard' },
  { code: 'dashboard:teacher', module: 'dashboard', action: 'teacher', description: 'View teacher dashboard' },
  { code: 'audit:read', module: 'audit', action: 'read', description: 'View audit trail' },
  { code: 'ai:manage_credits', module: 'ai', action: 'manage_credits', description: 'Top up AI credit wallet' },
  { code: 'papers:manage', module: 'papers', action: 'manage', description: 'Generate, upload and share question papers' },
  { code: 'enquiries:manage', module: 'enquiries', action: 'manage', description: 'Record and follow up admission enquiries' },
  { code: 'knowledge:manage', module: 'knowledge', action: 'manage', description: 'Write what the WhatsApp assistant tells parents' },
  { code: 'staff_attendance:manage', module: 'staff_attendance', action: 'manage', description: 'Mark teacher attendance and see what it means for salary' },
  { code: 'surveys:manage', module: 'surveys', action: 'manage', description: 'Send feedback surveys to parents and read the answers' },
  { code: 'certificates:manage', module: 'certificates', action: 'manage', description: 'Make certificates for students' },
  { code: 'exports:read', module: 'exports', action: 'read', description: 'Download student, attendance, fee and other data as Excel' },
  { code: 'portal:student', module: 'portal', action: 'student', description: 'Use the student panel: own attendance, homework, results and notices' },
  { code: 'student_logins:manage', module: 'student_logins', action: 'manage', description: 'Create, reset and switch off student logins' },
  { code: 'ai:view_logs', module: 'ai', action: 'view_logs', description: 'View AI usage ledger' },
];

/** A student gets exactly one permission: the portal. Every staff route needs a different one. */
const STUDENT_PERMISSION_CODES = ['portal:student'];

const TEACHER_PERMISSION_CODES = [
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
  'papers:manage',
  'notices:read',
  'dashboard:teacher',
];

async function main() {
  console.log('⚡ Initializing Vargly System RBAC Permissions and Plans (Zero Dummy Data)...');

  // 1. Seed Permissions
  for (const perm of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description, module: perm.module, action: perm.action },
      create: perm,
    });
  }
  console.log(`✔ Synced ${ALL_PERMISSIONS.length} system permissions.`);

  // 2. Ensure System Roles
  let ownerRole = await prisma.role.findFirst({
    where: { code: RoleType.OWNER, coachingId: null },
  });
  if (!ownerRole) {
    ownerRole = await prisma.role.create({
      data: {
        name: 'Coaching Owner',
        code: RoleType.OWNER,
        description: 'Full administrative control over coaching institute',
        isSystem: true,
      },
    });
  }

  let teacherRole = await prisma.role.findFirst({
    where: { code: RoleType.TEACHER, coachingId: null },
  });
  if (!teacherRole) {
    teacherRole = await prisma.role.create({
      data: {
        name: 'Faculty / Teacher',
        code: RoleType.TEACHER,
        description: 'Academic management, attendance, tests, homework and insights',
        isSystem: true,
      },
    });
  }

  let studentRole = await prisma.role.findFirst({
    where: { code: RoleType.STUDENT, coachingId: null },
  });
  if (!studentRole) {
    studentRole = await prisma.role.create({
      data: {
        name: 'Student',
        code: RoleType.STUDENT,
        description: 'A student signed in to the student panel: sees only their own records',
        isSystem: true,
      },
    });
  }

  // 3. Map Permissions to OWNER (Wildcard & all individual permissions)
  const dbPermissions = await prisma.permission.findMany();
  for (const p of dbPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ownerRole.id,
          permissionId: p.id,
        },
      },
      update: {},
      create: {
        roleId: ownerRole.id,
        permissionId: p.id,
      },
    });
  }

  // 3b. Map the portal permission to STUDENT, and nothing else
  for (const p of dbPermissions.filter((perm: any) => STUDENT_PERMISSION_CODES.includes(perm.code))) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: studentRole.id, permissionId: p.id } },
      update: {},
      create: { roleId: studentRole.id, permissionId: p.id },
    });
  }

  // 4. Map Permissions to TEACHER
  const teacherPerms = dbPermissions.filter((p: any) => TEACHER_PERMISSION_CODES.includes(p.code));
  for (const p of teacherPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: teacherRole.id,
          permissionId: p.id,
        },
      },
      update: {},
      create: {
        roleId: teacherRole.id,
        permissionId: p.id,
      },
    });
  }
  console.log('✔ Synced OWNER and TEACHER system roles & permission mappings.');

  // 5. Ensure Subscription Plans exist
  const fullFeatures = [
    'core',
    'attendance',
    'fees',
    'homework',
    'tests',
    'reports',
    'salary',
    'expenses',
    'ai.summary',
    'ai.parent_report',
    'ai.insights',
    'ai.risk_engine',
    'ai.papers',
    'ai.doubts',
    'whatsapp.assistant',
  ];

  await prisma.plan.upsert({
    where: { code: PlanCode.ENTERPRISE },
    // Features are kept in sync on every seed so a new feature reaches existing plans; prices
    // and credits are left alone because they may have been changed by hand
    update: { defaultFeatures: fullFeatures },
    create: {
      code: PlanCode.ENTERPRISE,
      name: 'Enterprise Pro AI Bundle',
      priceMonthly: 0,
      priceYearly: 0,
      defaultFeatures: fullFeatures,
      defaultCredits: 1000,
      isActive: true,
    },
  });

  await prisma.plan.upsert({
    where: { code: PlanCode.PRO_AI },
    update: { defaultFeatures: fullFeatures.filter((f) => f !== 'salary') },
    create: {
      code: PlanCode.PRO_AI,
      name: 'Pro AI Suite',
      priceMonthly: 699,
      priceYearly: 6990,
      defaultFeatures: fullFeatures.filter((f) => f !== 'salary'),
      defaultCredits: 500,
      isActive: true,
    },
  });

  await prisma.plan.upsert({
    where: { code: PlanCode.STARTER },
    update: { defaultFeatures: ['core', 'attendance', 'fees', 'reports'] },
    create: {
      code: PlanCode.STARTER,
      name: 'Starter Plan',
      priceMonthly: 299,
      priceYearly: 2990,
      defaultFeatures: ['core', 'attendance', 'fees', 'reports'],
      defaultCredits: 100,
      isActive: true,
    },
  });
  console.log('✔ Synced subscription plans.');
  console.log('🚀 Vargly database is primed for live user signups and logins. Zero dummy entities exist.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
