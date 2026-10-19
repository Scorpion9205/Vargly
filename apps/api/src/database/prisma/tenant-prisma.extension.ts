import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { RequestContextService } from '../../common/services/request-context.service.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import { logger } from '../../common/logger/logger.service.js';

/**
 * Tenant isolation, layer 1 of 2 (application layer).
 *
 * Every operation on a tenant-scoped model needs a tenant: either a coachingId in the
 * request context (HTTP request or RequestContextService.runForTenant) or an explicit
 * RequestContextService.runAsSystem(). Without one the query is refused (fail closed).
 *
 * Layer 2 is PostgreSQL RLS (migration 20260923000100): each statement runs in a
 * transaction that sets app.current_coaching_id / app.rls_bypass, so a query that slips
 * past this extension still cannot read or write another tenant's rows.
 */

// Models that are scoped to a specific coaching institute (have coachingId column)
export const TENANT_SCOPED_MODELS = new Set<string>([
  'User',
  'UserRole',
  'Student',
  'Parent',
  'StudentParent',
  'Teacher',
  'Batch',
  'BatchStudent',
  'TeacherBatch',
  'AttendanceSession',
  'AttendanceRecord',
  'Test',
  'TestResult',
  'Homework',
  'FeePlan',
  'FeeInstallment',
  'FeeTransaction',
  'Salary',
  'Expense',
  'NotificationHistory',
  'StudentTimeline',
  'RiskScore',
  'Subscription',
  'AiCreditWallet',
  'Setting',
  'AuditLog',
  'Notice',
  'CoachingKnowledgeBase',
  'CoachingKnowledgeChunk',
  'BillingPayment',
  'Paper',
  'PaperShare',
  'Enquiry',
]);

// Models that support soft deletion (have deletedAt column)
export const SOFT_DELETE_MODELS = new Set<string>([
  'Coaching',
  'User',
  'Role',
  'Student',
  'Parent',
  'Teacher',
  'Batch',
  'AttendanceSession',
  'Test',
  'Homework',
  'FeePlan',
  'FeeInstallment',
  'FeeTransaction',
  'Salary',
  'Expense',
  'Notice',
  'CoachingKnowledgeBase',
  'Paper',
  'Enquiry',
]);

// Models that track createdBy
const AUDITED_CREATE_MODELS = new Set<string>([
  'User',
  'Student',
  'Parent',
  'Teacher',
  'Batch',
  'Test',
  'Homework',
  'FeePlan',
  'FeeTransaction',
  'Expense',
  'Notice',
]);

// Models that track updatedBy
const AUDITED_UPDATE_MODELS = new Set<string>([
  'User',
  'Student',
  'Parent',
  'Teacher',
  'Batch',
  'Test',
  'Homework',
  'FeePlan',
  'FeeTransaction',
  'Expense',
]);

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const UNIQUE_WHERE_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'upsert', 'delete']);

export class TenantContextMissingError extends AppError {
  public constructor(model: string, operation: string) {
    super(
      'TENANT_CONTEXT_REQUIRED',
      `Refusing ${model}.${operation}: no tenant in context. Use RequestContextService.runForTenant() or runAsSystem().`,
      StatusCodes.FORBIDDEN,
    );
    this.name = 'TenantContextMissingError';
  }
}

export class CrossTenantAccessError extends AppError {
  public constructor(model: string, operation: string) {
    super(
      'CROSS_TENANT_ACCESS',
      `Refusing ${model}.${operation}: it targets a different coaching than the active tenant.`,
      StatusCodes.FORBIDDEN,
    );
    this.name = 'CrossTenantAccessError';
  }
}

type TenantScope = { kind: 'tenant'; coachingId: string } | { kind: 'system' } | { kind: 'none' };

function currentScope(): TenantScope {
  const coachingId = RequestContextService.getCoachingId();
  if (coachingId) return { kind: 'tenant', coachingId };
  if (RequestContextService.isSystemContext()) return { kind: 'system' };
  return { kind: 'none' };
}

/** Marks code running inside an interactive transaction whose connection already carries the tenant settings. */
const tenantTransactionStorage = new AsyncLocalStorage<true>();

function assertSameTenant(value: unknown, scope: TenantScope, model: string, operation: string): void {
  if (scope.kind === 'tenant' && value !== undefined && value !== scope.coachingId) {
    throw new CrossTenantAccessError(model, operation);
  }
}

function scopeWhere(
  where: Record<string, unknown> | undefined,
  scope: TenantScope,
  model: string,
  operation: string,
  { excludeDeleted }: { excludeDeleted: boolean },
): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (TENANT_SCOPED_MODELS.has(model) && scope.kind === 'tenant') {
    assertSameTenant(where?.coachingId, scope, model, operation);
    filters.coachingId = scope.coachingId;
  }
  // Callers may query deleted rows deliberately by constraining deletedAt themselves
  if (excludeDeleted && SOFT_DELETE_MODELS.has(model) && !(where && 'deletedAt' in where)) {
    filters.deletedAt = null;
  }

  if (Object.keys(filters).length === 0) return where ?? {};
  // Unique-where inputs must keep their unique fields at the top level (extendedWhereUnique)
  if (UNIQUE_WHERE_OPERATIONS.has(operation)) return { ...where, ...filters };
  return where && Object.keys(where).length > 0 ? { AND: [where, filters] } : filters;
}

function stampCreate(data: any, scope: TenantScope, model: string, operation: string): any {
  if (!data || typeof data !== 'object') return data;
  const stamped = { ...data };
  if (TENANT_SCOPED_MODELS.has(model) && scope.kind === 'tenant') {
    assertSameTenant(stamped.coachingId, scope, model, operation);
    if (!('coaching' in stamped)) stamped.coachingId = scope.coachingId;
  }
  const userId = RequestContextService.getUserId();
  if (AUDITED_CREATE_MODELS.has(model) && userId && stamped.createdBy === undefined) {
    stamped.createdBy = userId;
  }
  return stamped;
}

function stampUpdate(data: any, scope: TenantScope, model: string, operation: string): any {
  if (!data || typeof data !== 'object') return data;
  if (TENANT_SCOPED_MODELS.has(model)) assertSameTenant(data.coachingId, scope, model, operation);
  const userId = RequestContextService.getUserId();
  if (AUDITED_UPDATE_MODELS.has(model) && userId && data.updatedBy === undefined) {
    return { ...data, updatedBy: userId };
  }
  return data;
}

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function rlsSettingStatement(base: PrismaClient, scope: TenantScope) {
  return scope.kind === 'tenant'
    ? base.$executeRaw`SELECT set_config('app.current_coaching_id', ${scope.coachingId}, true)`
    : base.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
}

export function createTenantPrismaClient(baseClient?: PrismaClient) {
  const base = baseClient ?? new PrismaClient();

  /** Runs a statement with the tenant's RLS settings applied on its connection. */
  async function withRls<T>(scope: TenantScope, run: () => Promise<T> | any): Promise<T> {
    if (tenantTransactionStorage.getStore() || scope.kind === 'none') return run();
    const [, result] = await base.$transaction([rlsSettingStatement(base, scope), run()]);
    return result as T;
  }

  const extended = base.$extends({
    name: 'TenantIsolationAndSoftDelete',
    query: {
      async $allOperations({ model, operation, args, query }) {
        const scope = currentScope();

        // Raw SQL ($queryRaw/$executeRaw): cannot be rewritten, but RLS still applies
        if (!model) return withRls(scope, () => query(args));

        const isTenantModel = TENANT_SCOPED_MODELS.has(model);
        if (isTenantModel && scope.kind === 'none') {
          throw new TenantContextMissingError(model, operation);
        }
        if (!isTenantModel && !SOFT_DELETE_MODELS.has(model)) {
          return withRls(scope, () => query(args));
        }

        const a: any = { ...(args as any) };

        if (READ_OPERATIONS.has(operation)) {
          a.where = scopeWhere(a.where, scope, model, operation, { excludeDeleted: true });
          return withRls(scope, () => query(a));
        }

        switch (operation) {
          case 'create':
            a.data = stampCreate(a.data, scope, model, operation);
            break;
          case 'createMany':
          case 'createManyAndReturn':
            a.data = Array.isArray(a.data)
              ? a.data.map((item: any) => stampCreate(item, scope, model, operation))
              : stampCreate(a.data, scope, model, operation);
            break;
          case 'update':
          case 'updateMany':
            a.where = scopeWhere(a.where, scope, model, operation, { excludeDeleted: true });
            a.data = stampUpdate(a.data, scope, model, operation);
            break;
          case 'upsert':
            a.where = scopeWhere(a.where, scope, model, operation, { excludeDeleted: false });
            a.create = stampCreate(a.create, scope, model, operation);
            a.update = stampUpdate(a.update, scope, model, operation);
            break;
          case 'delete':
          case 'deleteMany': {
            a.where = scopeWhere(a.where, scope, model, operation, { excludeDeleted: SOFT_DELETE_MODELS.has(model) });
            if (!SOFT_DELETE_MODELS.has(model)) break;

            // Soft delete: rewrite to an update of deletedAt
            if (tenantTransactionStorage.getStore()) {
              throw new AppError(
                'SOFT_DELETE_IN_TRANSACTION',
                `${model}.${operation} inside a transaction would escape it; use update({ data: { deletedAt: new Date() } }) on the transaction client`,
                StatusCodes.INTERNAL_SERVER_ERROR,
              );
            }
            const userId = RequestContextService.getUserId();
            const data = {
              deletedAt: new Date(),
              ...(AUDITED_UPDATE_MODELS.has(model) && userId ? { updatedBy: userId } : {}),
            };
            logger.debug(`[TenantPrisma] Rewriting ${operation} to soft delete for ${model}`);
            const delegate = (base as any)[delegateName(model)];
            return withRls(scope, () =>
              operation === 'delete'
                ? delegate.update({ where: a.where, data })
                : delegate.updateMany({ where: a.where, data }),
            );
          }
          default:
            // Unknown operations on isolated models are refused rather than run unscoped
            if (isTenantModel) throw new TenantContextMissingError(model, operation);
        }

        return withRls(scope, () => query(a));
      },
    },
  });

  // Interactive transactions: set the tenant once on the transaction's own connection and
  // mark the async context so the hooks above run statements directly on it. Wrapping each
  // statement in its own batch transaction here would silently move it outside the
  // caller's transaction and break atomicity.
  return new Proxy(extended, {
    get(target, prop, receiver) {
      if (prop !== '$transaction') return Reflect.get(target, prop, receiver);

      return (fn: unknown, options?: unknown) => {
        if (typeof fn !== 'function') {
          throw new Error('Batch $transaction([...]) is not supported with tenant RLS; use an interactive transaction');
        }
        if (tenantTransactionStorage.getStore()) {
          throw new Error('Nested interactive transactions are not supported');
        }
        const scope = currentScope();
        return (target as any).$transaction(
          (tx: any) =>
            tenantTransactionStorage.run(true, async () => {
              if (scope.kind === 'tenant') {
                await tx.$executeRaw`SELECT set_config('app.current_coaching_id', ${scope.coachingId}, true)`;
              } else if (scope.kind === 'system') {
                await tx.$executeRaw`SELECT set_config('app.rls_bypass', 'on', true)`;
              }
              return (fn as (tx: any) => unknown)(tx);
            }),
          options,
        );
      };
    },
  }) as typeof extended;
}

export type ExtendedPrismaClient = ReturnType<typeof createTenantPrismaClient>;

// Singleton database connection
let prismaInstance: ExtendedPrismaClient | null = null;

export function getPrismaClient(): ExtendedPrismaClient {
  if (!prismaInstance) {
    const rawClient = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'error' },
              { emit: 'stdout', level: 'warn' },
            ]
          : [{ emit: 'stdout', level: 'error' }],
    });

    if (process.env.NODE_ENV === 'development') {
      (rawClient as any).$on('query', (e: any) => {
        logger.debug(`[Prisma Query] (${e.duration}ms) ${e.query}`);
      });
    }

    prismaInstance = createTenantPrismaClient(rawClient);
  }
  return prismaInstance;
}
