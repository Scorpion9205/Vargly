import { Redis } from 'ioredis';
import { RoleType } from '@vargly/types';
import { queueRegistry } from '../../queues/queue.registry.js';
import { logger } from '../logger/logger.service.js';
import { RequestContextService } from '../services/request-context.service.js';
import {
  getPrismaClient,
  ExtendedPrismaClient,
} from '../../database/prisma/tenant-prisma.extension.js';

export interface ResolvedAccess {
  readonly roles: RoleType[];
  readonly permissions: string[];
  /** Access tokens issued before this moment (milliseconds since the epoch) are refused */
  readonly tokensValidAfter?: number;
  /** A temporary password is in use: only the sign-in and password routes work until it is replaced */
  readonly mustChangePassword?: boolean;
}

export interface IAccessCacheInvalidator {
  invalidate(userId: string): Promise<void>;
}

/**
 * Resolves a user's current roles and permissions from the database instead of trusting the
 * copy frozen into their access token, so role changes and deactivation apply on the next
 * request rather than when the token expires. Results are cached briefly in Redis and
 * dropped explicitly whenever a user's roles or status change.
 */
export class PermissionResolver implements IAccessCacheInvalidator {
  private static instance: PermissionResolver;

  public constructor(
    private readonly prisma: ExtendedPrismaClient = getPrismaClient(),
    private readonly redis: () => Redis = () => queueRegistry.getRedisClient(),
    private readonly ttlSeconds = 60,
  ) {}

  public static getInstance(): PermissionResolver {
    if (!PermissionResolver.instance) {
      PermissionResolver.instance = new PermissionResolver();
    }
    return PermissionResolver.instance;
  }

  private cacheKey(userId: string): string {
    return `authz:v1:user:${userId}`;
  }

  /**
   * Returns null when the user no longer exists, was deleted or deactivated, or does not
   * belong to the coaching named in their token.
   */
  public async resolve(userId: string, coachingId?: string): Promise<ResolvedAccess | null> {
    const cached = await this.readCache(userId);
    if (cached) return cached;

    const load = () => this.loadFromDatabase(userId, coachingId);
    // Platform users (SUPER_ADMIN) have no coaching, so their lookup cannot be tenant-scoped
    const access = coachingId
      ? await RequestContextService.runForTenant(coachingId, load)
      : await RequestContextService.runAsSystem('authz:platform-user', load);

    if (access) await this.writeCache(userId, access);
    return access;
  }

  public async invalidate(userId: string): Promise<void> {
    try {
      const redis = this.redis();
      if (redis.status === 'ready') await redis.del(this.cacheKey(userId));
    } catch (err) {
      logger.warn('[PermissionResolver] Failed to invalidate cached access', {
        userId,
        error: (err as Error).message,
      });
    }
  }

  private async loadFromDatabase(
    userId: string,
    coachingId?: string,
  ): Promise<ResolvedAccess | null> {
    const user = await (this.prisma as any).user.findFirst({
      where: { id: userId, isActive: true, ...(coachingId ? {} : { coachingId: null }) },
      include: {
        teacherProfile: { select: { isActive: true, deletedAt: true } },
        studentProfile: { select: { isActive: true, deletedAt: true } },
        userRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!user) return null;

    const teacherInactive =
      !!user.teacherProfile &&
      (!user.teacherProfile.isActive || user.teacherProfile.deletedAt !== null);

    // A student who has left keeps the record but not the login
    if (user.studentProfile && (!user.studentProfile.isActive || user.studentProfile.deletedAt !== null)) return null;

    const roles = new Set<RoleType>();
    const permissions = new Set<string>();
    for (const userRole of user.userRoles) {
      const role = userRole.role;
      if (!role || role.deletedAt) continue;
      // A deactivated teacher keeps their login record but loses the teaching role
      if (role.code === RoleType.TEACHER && teacherInactive) continue;
      roles.add(role.code as RoleType);
      for (const rp of role.rolePermissions) permissions.add(rp.permission.code);
    }

    return {
      roles: [...roles],
      permissions: [...permissions],
      ...(user.tokensValidAfter ? { tokensValidAfter: new Date(user.tokensValidAfter).getTime() } : {}),
      ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
    };
  }

  private async readCache(userId: string): Promise<ResolvedAccess | null> {
    try {
      const redis = this.redis();
      if (redis.status !== 'ready') return null;
      const raw = await redis.get(this.cacheKey(userId));
      return raw ? (JSON.parse(raw) as ResolvedAccess) : null;
    } catch {
      return null;
    }
  }

  private async writeCache(userId: string, access: ResolvedAccess): Promise<void> {
    try {
      const redis = this.redis();
      if (redis.status === 'ready') {
        await redis.setex(this.cacheKey(userId), this.ttlSeconds, JSON.stringify(access));
      }
    } catch {
      // Cache is an optimisation; the database stays authoritative
    }
  }
}

export const permissionResolver = PermissionResolver.getInstance();
