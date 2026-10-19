import crypto from 'node:crypto';
import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { envConfig } from '../../config/env.config.js';
import { RoleType } from '@vargly/types';
import { logger } from '../logger/logger.service.js';

export interface TokenPayload {
  readonly sub: string; // userId
  readonly coachingId?: string;
  readonly email: string;
  readonly roles: RoleType[];
  readonly permissions: string[];
  /**
   * When the token was issued, in milliseconds. The standard iat claim has one-second
   * resolution, too coarse to tell a token from just before a password change from one signed in
   * just after it. Set by the token service; absent on tokens issued before this claim existed.
   */
  readonly issuedAtMs?: number;
  /** Standard iat claim (seconds); read by verifyAccessToken only */
  readonly iat?: number;
}

export interface ITokenService {
  generateAccessToken(payload: TokenPayload): string;
  verifyAccessToken(token: string): TokenPayload;
  generateRefreshToken(): { rawToken: string; hashedToken: string; family: string };
  hashToken(token: string): string;
}

import fs from 'node:fs';
import path from 'node:path';

export class TokenService implements ITokenService {
  private static instance: TokenService;
  private readonly privateKey: string;
  private readonly publicKey: string;

  private constructor() {
    const envPrivKey = envConfig.get('JWT_PRIVATE_KEY');
    const envPubKey = envConfig.get('JWT_PUBLIC_KEY');

    if (envPrivKey && envPubKey) {
      this.privateKey = envPrivKey.replace(/\\n/g, '\n');
      this.publicKey = envPubKey.replace(/\\n/g, '\n');
      logger.info('[TokenService] Loaded RS256 asymmetric cryptographic keys from environment');
      return;
    }

    // Every replica must verify tokens signed by every other replica, so a
    // per-process generated key is never acceptable in production.
    if (envConfig.get('NODE_ENV') === 'production') {
      throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set in production');
    }

    // In local development, persist keypair to avoid invalidating sessions across restarts
    const keysDir = path.resolve(process.cwd(), '.keys');
    const privPath = path.join(keysDir, 'jwt_rs256.key');
    const pubPath = path.join(keysDir, 'jwt_rs256.pub');

    try {
      if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
        this.privateKey = fs.readFileSync(privPath, 'utf8');
        this.publicKey = fs.readFileSync(pubPath, 'utf8');
        logger.info('[TokenService] Loaded RS256 cryptographic keys from persistent storage');
        return;
      }
    } catch {
      // Fall through to generation
    }

    // Generate fresh RSA 2048-bit key pair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    this.privateKey = privateKey;
    this.publicKey = publicKey;

    try {
      if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
      }
      fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
      fs.writeFileSync(pubPath, publicKey, { mode: 0o644 });
      logger.info('[TokenService] Generated and persisted new RS256 cryptographic keys to .keys/');
    } catch {
      logger.info('[TokenService] Generated ephemeral in-memory RS256 cryptographic keys');
    }
  }

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  public getPublicKey(): string {
    return this.publicKey;
  }

  public generateAccessToken(payload: TokenPayload): string {
    const options: SignOptions = {
      algorithm: 'RS256',
      expiresIn: envConfig.get('JWT_ACCESS_EXPIRES_IN') as any,
      issuer: 'vargly-auth-service',
      audience: 'vargly-clients',
    };

    return jwt.sign({ ...payload, issuedAtMs: Date.now() }, this.privateKey, options);
  }

  public verifyAccessToken(token: string): TokenPayload {
    const options: VerifyOptions = {
      algorithms: ['RS256'],
      issuer: 'vargly-auth-service',
      audience: 'vargly-clients',
    };

    const decoded = jwt.verify(token, this.publicKey, options) as jwt.JwtPayload;
    return {
      sub: decoded.sub as string,
      coachingId: decoded.coachingId as string | undefined,
      email: decoded.email as string,
      roles: (decoded.roles || []) as RoleType[],
      permissions: (decoded.permissions || []) as string[],
      issuedAtMs: typeof decoded.issuedAtMs === 'number' ? decoded.issuedAtMs : undefined,
      iat: decoded.iat,
    };
  }

  public generateRefreshToken(): { rawToken: string; hashedToken: string; family: string } {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const family = crypto.randomUUID();
    const hashedToken = this.hashToken(rawToken);

    return { rawToken, hashedToken, family };
  }

  public hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const tokenService = TokenService.getInstance();
