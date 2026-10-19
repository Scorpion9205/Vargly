import { StatusCodes } from 'http-status-codes';
import {
  AuthActionPurpose,
  IAuthActionTokenRepository,
  IAuthUserRepository,
  IRefreshTokenRepository,
  PrismaAuthActionTokenRepository,
} from './auth.repository.js';
import { IPasswordService } from '../../common/security/password.service.js';
import { ITokenService } from '../../common/security/token.service.js';
import { IAccountLockoutService } from '../../common/security/account-lockout.service.js';
import { IEventBus } from '../../events/event-bus.interface.js';
import { AppError } from '../../common/middleware/error-handler.middleware.js';
import crypto from 'node:crypto';
import { envConfig } from '../../config/env.config.js';
import { AuthMapper } from './auth.mapper.js';
import { AuthResponseDto, AuthUserDto, LoginDto } from './dto/auth.dto.js';
import { createUserLoggedInEvent, createUserLoggedOutEvent } from './auth.events.js';
import { logger } from '../../common/logger/logger.service.js';
import { permissionResolver } from '../../common/security/permission-resolver.service.js';
import { EmailAuthMailer, IAuthMailer } from './auth.mailer.js';
import { IOtpService, otpService as defaultOtpService } from '../../common/security/otp.service.js';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;

export class AuthService {
  public constructor(
    private readonly userRepository: IAuthUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly passwordService: IPasswordService,
    private readonly tokenService: ITokenService,
    private readonly lockoutService: IAccountLockoutService,
    private readonly eventBus: IEventBus,
    private readonly otpService: IOtpService = defaultOtpService,
    private readonly actionTokenRepository: IAuthActionTokenRepository = new PrismaAuthActionTokenRepository(),
    private readonly mailer: IAuthMailer = new EmailAuthMailer(),
  ) {}

  public async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<AuthResponseDto> {
    const lockoutKey = `${dto.email}:${ipAddress || 'unknown'}`;

    // 1. Check if account is locked out via Redis sliding window
    const lockoutStatus = await this.lockoutService.isLocked(lockoutKey);
    if (lockoutStatus.locked) {
      throw new AppError(
        'ACCOUNT_LOCKED',
        `Account temporarily locked due to repeated failed login attempts. Try again in ${Math.ceil(
          (lockoutStatus.remainingSeconds || 900) / 60,
        )} minutes.`,
        StatusCodes.TOO_MANY_REQUESTS,
      );
    }

    // 2. Fetch User Aggregate
    const user = await this.userRepository.findByEmail(dto.email, dto.coachingCode);
    if (!user) {
      await this.lockoutService.recordFailedAttempt(lockoutKey);
      throw new AppError(
        'INVALID_CREDENTIALS',
        'Invalid email or password',
        StatusCodes.UNAUTHORIZED,
      );
    }

    if (!user.isActive) {
      throw new AppError(
        'ACCOUNT_INACTIVE',
        'Your account has been deactivated. Please contact support.',
        StatusCodes.FORBIDDEN,
      );
    }

    // 3. Verify Argon2id Password Hash
    const isPasswordValid = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      const lockResult = await this.lockoutService.recordFailedAttempt(lockoutKey);
      if (lockResult.locked) {
        throw new AppError(
          'ACCOUNT_LOCKED',
          'Account locked due to 5 consecutive failed login attempts. Please wait 15 minutes.',
          StatusCodes.TOO_MANY_REQUESTS,
        );
      }
      throw new AppError(
        'INVALID_CREDENTIALS',
        'Invalid email or password',
        StatusCodes.UNAUTHORIZED,
      );
    }

    // 4. Reset lockout counter on success
    await this.lockoutService.resetAttempts(lockoutKey);

    // 5. Transform User to DTO
    const userDto = AuthMapper.toUserDto(user);

    // 6. Generate RS256 Access Token
    const accessToken = this.tokenService.generateAccessToken({
      sub: userDto.id,
      coachingId: userDto.coachingId,
      email: userDto.email,
      roles: userDto.roles,
      permissions: userDto.permissions,
    });

    // 7. Generate Rotating Refresh Token
    const { rawToken, hashedToken, family } = this.tokenService.generateRefreshToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    await this.refreshTokenRepository.create({
      userId: userDto.id,
      tokenHash: hashedToken,
      family,
      expiresAt,
      userAgent,
      ipAddress,
    });

    // 8. Update Last Login Timestamp
    await this.userRepository.updateLastLogin(userDto.id);

    // 9. Emit Domain Event
    await this.eventBus.publish(
      createUserLoggedInEvent(
        {
          userId: userDto.id,
          coachingId: userDto.coachingId,
          email: userDto.email,
          roles: userDto.roles,
          ipAddress,
        },
        correlationId,
      ),
    );

    return {
      user: userDto,
      tokens: {
        accessToken,
        refreshToken: rawToken,
        tokenType: 'Bearer',
        expiresIn: 15 * 60, // 15 minutes
      },
    };
  }

  public async refresh(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const hashedToken = this.tokenService.hashToken(rawRefreshToken);
    const storedToken = await this.refreshTokenRepository.findByTokenHash(hashedToken);

    if (!storedToken) {
      throw new AppError(
        'INVALID_TOKEN',
        'Refresh token is invalid or unrecognized',
        StatusCodes.UNAUTHORIZED,
      );
    }

    // Reuse Detection: If token is already revoked, revoke its entire family to stop token theft!
    if (storedToken.isRevoked) {
      logger.warn(
        `[AuthService] Refresh token replay attack detected for family ${storedToken.family}`,
      );
      await this.refreshTokenRepository.revokeFamily(storedToken.family);
      throw new AppError(
        'TOKEN_REUSED',
        'Token reuse detected. All sessions in this family revoked for security.',
        StatusCodes.UNAUTHORIZED,
      );
    }

    // Check expiration
    if (storedToken.expiresAt.getTime() < Date.now()) {
      throw new AppError(
        'TOKEN_EXPIRED',
        'Refresh token has expired. Please login again.',
        StatusCodes.UNAUTHORIZED,
      );
    }

    // Revoke the old token (one-time rotation)
    await this.refreshTokenRepository.revoke(storedToken.id);

    // Fetch user
    const user = await this.userRepository.findById(storedToken.userId);
    if (!user || !user.isActive) {
      throw new AppError(
        'USER_INACTIVE',
        'User associated with token no longer active',
        StatusCodes.UNAUTHORIZED,
      );
    }

    const userDto = AuthMapper.toUserDto(user);

    // Generate new Access Token
    const newAccessToken = this.tokenService.generateAccessToken({
      sub: userDto.id,
      coachingId: userDto.coachingId,
      email: userDto.email,
      roles: userDto.roles,
      permissions: userDto.permissions,
    });

    // Generate rotated Refresh Token within the SAME family
    const { rawToken, hashedToken: newHashedToken } = this.tokenService.generateRefreshToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.refreshTokenRepository.create({
      userId: userDto.id,
      tokenHash: newHashedToken,
      family: storedToken.family, // Preserve family for replay chain
      expiresAt,
      userAgent,
      ipAddress,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: rawToken,
      expiresIn: 15 * 60,
    };
  }

  public async logout(
    rawRefreshToken: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<void> {
    const hashedToken = this.tokenService.hashToken(rawRefreshToken);
    const storedToken = await this.refreshTokenRepository.findByTokenHash(hashedToken);
    if (storedToken) {
      await this.refreshTokenRepository.revoke(storedToken.id);
      await this.eventBus.publish(
        createUserLoggedOutEvent(
          {
            userId: storedToken.userId,
            reason: 'EXPLICIT_LOGOUT',
          },
          correlationId,
        ),
      );
    }
  }

  public async logoutAllDevices(
    userId: string,
    correlationId: string = crypto.randomUUID(),
  ): Promise<void> {
    await this.refreshTokenRepository.revokeAllForUser(userId);
    await this.eventBus.publish(
      createUserLoggedOutEvent(
        {
          userId,
          reason: 'ALL_DEVICES_LOGOUT',
        },
        correlationId,
      ),
    );
  }

  public async getMe(userId: string): Promise<AuthUserDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User profile not found', StatusCodes.NOT_FOUND);
    }
    return AuthMapper.toUserDto(user);
  }

  public async forgotPassword(email: string, coachingCode?: string): Promise<{ message: string }> {
    const genericReply = {
      message: 'If an account exists with that email, a password reset link has been dispatched.',
    };
    const user = await this.userRepository.findByEmail(email, coachingCode);
    if (!user || !user.isActive) return genericReply;

    const resetToken = await this.issueActionToken(
      user.id,
      'PASSWORD_RESET',
      PASSWORD_RESET_TTL_MS,
    );
    await this.deliver('password reset', () => this.mailer.sendPasswordReset(user.email, resetToken));

    // Reset tokens grant account takeover; besides the email they may only surface on a local
    // development terminal.
    if (envConfig.get('NODE_ENV') === 'development') {
      logger.debug(`[AuthService] Password reset token generated for ${user.email}: ${resetToken}`);
    }
    return genericReply;
  }

  /** Issues an email verification token for a user; returns the raw token for delivery. */
  public async issueEmailVerification(userId: string, email: string): Promise<string> {
    const token = await this.issueActionToken(
      userId,
      'EMAIL_VERIFICATION',
      EMAIL_VERIFICATION_TTL_MS,
    );
    await this.deliver('email verification', () => this.mailer.sendEmailVerification(email, token));
    if (envConfig.get('NODE_ENV') === 'development') {
      logger.debug(`[AuthService] Email verification token generated for ${email}: ${token}`);
    }
    return token;
  }

  /**
   * Email failures are logged, not thrown: the caller's reply must not reveal whether an
   * account exists, and the user can simply request another link.
   */
  private async deliver(kind: string, send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (err) {
      logger.error(`[AuthService] Could not deliver ${kind} email`, err);
    }
  }

  private async issueActionToken(
    userId: string,
    purpose: AuthActionPurpose,
    ttlMs: number,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    await this.actionTokenRepository.issue(
      userId,
      purpose,
      this.tokenService.hashToken(rawToken),
      new Date(Date.now() + ttlMs),
    );
    return rawToken;
  }

  public async sendOtp(
    identifier: string,
    purpose: 'SIGNUP' | 'LOGIN' | 'PASSWORD_RESET' | string = 'LOGIN',
  ): Promise<{ message: string; identifier: string }> {
    await this.otpService.generateOtp(identifier, purpose, 600);
    return {
      message: 'If the identifier is registered, a one-time code has been sent.',
      identifier,
    };
  }

  public async verifyOtp(
    identifier: string,
    code: string,
    purpose: 'SIGNUP' | 'LOGIN' | 'PASSWORD_RESET' | string = 'LOGIN',
    ipAddress?: string,
    userAgent?: string,
    coachingCode?: string,
  ): Promise<AuthResponseDto | { message: string }> {
    const isValid = await this.otpService.verifyOtp(identifier, code, purpose);
    if (!isValid) {
      throw new AppError(
        'INVALID_OR_EXPIRED_OTP',
        'The entered OTP is invalid or has expired',
        StatusCodes.UNAUTHORIZED,
      );
    }

    if (purpose === 'LOGIN') {
      const user = await this.userRepository.findByEmail(identifier, coachingCode);
      if (!user || !user.isActive) {
        throw new AppError(
          'INVALID_OR_EXPIRED_OTP',
          'The entered OTP is invalid or has expired',
          StatusCodes.UNAUTHORIZED,
        );
      }

      const userDto = AuthMapper.toUserDto(user);
      const accessToken = this.tokenService.generateAccessToken({
        sub: userDto.id,
        coachingId: userDto.coachingId,
        email: userDto.email,
        roles: userDto.roles,
        permissions: userDto.permissions,
      });

      const { rawToken, hashedToken, family } = this.tokenService.generateRefreshToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await this.refreshTokenRepository.create({
        userId: userDto.id,
        tokenHash: hashedToken,
        family,
        expiresAt,
        userAgent,
        ipAddress,
      });

      await this.userRepository.updateLastLogin(userDto.id);

      return {
        user: userDto,
        tokens: {
          accessToken,
          refreshToken: rawToken,
          tokenType: 'Bearer',
          expiresIn: 15 * 60,
        },
      };
    }

    return { message: `OTP verified successfully for ${purpose}.` };
  }

  public async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const userId = await this.actionTokenRepository.consume(
      this.tokenService.hashToken(token),
      'PASSWORD_RESET',
    );
    if (!userId) {
      throw new AppError(
        'INVALID_OR_EXPIRED_TOKEN',
        'Password reset link is invalid, expired or already used',
        StatusCodes.BAD_REQUEST,
      );
    }

    const newHash = await this.passwordService.hash(newPassword);
    await this.userRepository.updatePassword(userId, newHash);
    await this.refreshTokenRepository.revokeAllForUser(userId);
    // Drop the cached access so the next request sees the new tokens-valid-after moment
    await permissionResolver.invalidate(userId);

    return {
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  /**
   * Changes the signed-in user's password after checking the current one, then signs them out
   * everywhere: anyone holding an old session loses it along with the old password.
   */
  public async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', StatusCodes.NOT_FOUND);
    }
    if (!(await this.passwordService.verify(user.passwordHash, currentPassword))) {
      throw new AppError(
        'WRONG_PASSWORD',
        'The current password is not correct',
        StatusCodes.BAD_REQUEST,
        [{ path: ['currentPassword'], message: 'The current password is not correct' }],
      );
    }
    if (currentPassword === newPassword) {
      throw new AppError(
        'SAME_PASSWORD',
        'The new password must be different from the current one',
        StatusCodes.BAD_REQUEST,
        [{ path: ['newPassword'], message: 'Choose a different password' }],
      );
    }

    await this.userRepository.updatePassword(userId, await this.passwordService.hash(newPassword));
    await this.refreshTokenRepository.revokeAllForUser(userId);
    // Drop the cached access so the next request sees the new tokens-valid-after moment
    await permissionResolver.invalidate(userId);
    return { message: 'Password changed. Please sign in again with your new password.' };
  }

  public async verifyEmail(token: string): Promise<{ message: string }> {
    const userId = await this.actionTokenRepository.consume(
      this.tokenService.hashToken(token),
      'EMAIL_VERIFICATION',
    );
    if (!userId) {
      throw new AppError(
        'INVALID_OR_EXPIRED_TOKEN',
        'Verification link is invalid, expired or already used',
        StatusCodes.BAD_REQUEST,
      );
    }

    await this.userRepository.markEmailVerified(userId);
    return { message: 'Email verified successfully.' };
  }
}
