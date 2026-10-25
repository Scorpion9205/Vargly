import { RequestContextService } from '../../common/services/request-context.service.js';
import {
  getPrismaClient,
  ExtendedPrismaClient,
} from '../../database/prisma/tenant-prisma.extension.js';
import { UserAggregate } from './auth.mapper.js';

export interface StoredRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  family: string;
  isRevoked: boolean;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface IAuthUserRepository {
  findByEmail(email: string, coachingCode?: string): Promise<UserAggregate | null>;
  findById(id: string): Promise<UserAggregate | null>;
  updateLastLogin(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;
}

export type AuthActionPurpose = 'PASSWORD_RESET' | 'EMAIL_VERIFICATION';

export interface IAuthActionTokenRepository {
  /** Stores a new token hash and invalidates the user's earlier unused tokens of the same purpose. */
  issue(
    userId: string,
    purpose: AuthActionPurpose,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  /** Marks the token used if it is unused and unexpired; returns its user, or null. Succeeds at most once. */
  consume(tokenHash: string, purpose: AuthActionPurpose): Promise<string | null>;
}

export interface IRefreshTokenRepository {
  create(token: {
    userId: string;
    tokenHash: string;
    family: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<StoredRefreshToken>;
  findByTokenHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  revoke(id: string): Promise<void>;
  revokeFamily(family: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

/**
 * Identity lookups are cross-tenant by nature: credentials arrive before any tenant is known,
 * and emails are only unique per coaching. These methods therefore run as explicit system
 * operations; callers must still bind the result to the user's own coaching.
 */
export class PrismaAuthUserRepository implements IAuthUserRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async findByEmail(email: string, coachingCode?: string): Promise<UserAggregate | null> {
    return RequestContextService.runAsSystem('auth:findByEmail', async () => {
      // Email is only unique per coaching. Without a coaching code, an email registered at
      // several institutes is ambiguous and must not resolve to an arbitrary tenant's account.
      const users = await (this.prisma as any).user.findMany({
        take: 2,
        where: {
          email: email.toLowerCase().trim(),
          deletedAt: null,
          ...(coachingCode ? { coaching: { code: coachingCode.trim() } } : {}),
        },
        include: {
          studentProfile: { select: { isActive: true, deletedAt: true } },
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (users.length !== 1) return null;
      return users[0] as UserAggregate;
    });
  }

  public async findById(id: string): Promise<UserAggregate | null> {
    return RequestContextService.runAsSystem('auth:findById', async () => {
      const user = await (this.prisma as any).user.findFirst({
        where: { id, deletedAt: null },
        include: {
          studentProfile: { select: { isActive: true, deletedAt: true } },
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return user as UserAggregate | null;
    });
  }

  public async updateLastLogin(userId: string): Promise<void> {
    return RequestContextService.runAsSystem('auth:updateLastLogin', async () => {
      await (this.prisma as any).user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      });
    });
  }

  public async updatePassword(userId: string, passwordHash: string): Promise<void> {
    return RequestContextService.runAsSystem('auth:updatePassword', async () => {
      await (this.prisma as any).user.update({
        where: { id: userId },
        // The same update ends the user's earlier access tokens (see PermissionResolver)
        data: { passwordHash, tokensValidAfter: new Date(), mustChangePassword: false },
      });
    });
  }

  public async markEmailVerified(userId: string): Promise<void> {
    return RequestContextService.runAsSystem('auth:markEmailVerified', async () => {
      await (this.prisma as any).user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
    });
  }
}

export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async create(data: {
    userId: string;
    tokenHash: string;
    family: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<StoredRefreshToken> {
    const record = await (this.prisma as any).refreshToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        family: data.family,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
      },
    });
    return record as StoredRefreshToken;
  }

  public async findByTokenHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const record = await (this.prisma as any).refreshToken.findUnique({
      where: { tokenHash },
    });
    return record as StoredRefreshToken | null;
  }

  public async revoke(id: string): Promise<void> {
    await (this.prisma as any).refreshToken.update({
      where: { id },
      data: { isRevoked: true },
    });
  }

  public async revokeFamily(family: string): Promise<void> {
    await (this.prisma as any).refreshToken.updateMany({
      where: { family },
      data: { isRevoked: true },
    });
  }

  public async revokeAllForUser(userId: string): Promise<void> {
    await (this.prisma as any).refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }
}

// Action tokens are looked up by hash before any tenant is known and carry no tenant data.
export class PrismaAuthActionTokenRepository implements IAuthActionTokenRepository {
  public constructor(private readonly prisma: ExtendedPrismaClient = getPrismaClient()) {}

  public async issue(
    userId: string,
    purpose: AuthActionPurpose,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const db = this.prisma as any;
    await db.authActionToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    await db.authActionToken.create({ data: { userId, purpose, tokenHash, expiresAt } });
  }

  public async consume(tokenHash: string, purpose: AuthActionPurpose): Promise<string | null> {
    const db = this.prisma as any;
    const token = await db.authActionToken.findUnique({ where: { tokenHash } });
    if (!token || token.purpose !== purpose) return null;

    // Conditional update: of two concurrent attempts, only one can flip usedAt
    const now = new Date();
    const { count } = await db.authActionToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return count === 1 ? token.userId : null;
  }
}
