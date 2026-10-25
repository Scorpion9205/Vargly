import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { tokenService, TokenPayload } from '../security/token.service.js';
import { permissionResolver } from '../security/permission-resolver.service.js';
import { RequestContextService } from '../services/request-context.service.js';
import { AppError } from './error-handler.middleware.js';
import { RequestContextData } from '@vargly/types';

export async function authenticateMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(
      'UNAUTHORIZED',
      'Missing or invalid Authorization header',
      StatusCodes.UNAUTHORIZED,
    );
  }

  let payload: TokenPayload;
  try {
    payload = tokenService.verifyAccessToken(authHeader.substring(7).trim());
  } catch {
    throw new AppError(
      'INVALID_TOKEN',
      'Access token is expired or invalid',
      StatusCodes.UNAUTHORIZED,
    );
  }

  // The token proves identity only. Roles and permissions are re-read from the database
  // (briefly cached) so revocations and deactivation take effect immediately.
  const access = await permissionResolver.resolve(payload.sub, payload.coachingId);
  if (!access) {
    throw new AppError(
      'ACCOUNT_INACTIVE',
      'This account is no longer active',
      StatusCodes.UNAUTHORIZED,
    );
  }

  // A password change or reset ends the user's earlier sessions, access tokens included. Tokens
  // from before the millisecond claim existed fall back to their (coarser) iat.
  if (access.tokensValidAfter !== undefined) {
    const issuedAtMs = payload.issuedAtMs ?? (payload.iat !== undefined ? payload.iat * 1000 : undefined);
    if (issuedAtMs === undefined || issuedAtMs < access.tokensValidAfter) {
      throw new AppError(
        'INVALID_TOKEN',
        'This session has ended; please sign in again',
        StatusCodes.UNAUTHORIZED,
      );
    }
  }

  // A temporary password is only good for signing in and choosing a new one
  if (access.mustChangePassword && !req.originalUrl.startsWith('/api/v1/auth/')) {
    throw new AppError(
      'PASSWORD_CHANGE_REQUIRED',
      'Choose a new password before you continue',
      StatusCodes.FORBIDDEN,
    );
  }

  const currentContext = RequestContextService.getContext();
  const authenticatedContext: RequestContextData = {
    traceId: currentContext?.traceId || 'auth-trace',
    coachingId: payload.coachingId,
    userId: payload.sub,
    userEmail: payload.email,
    roles: access.roles,
    permissions: access.permissions,
    features: currentContext?.features || [],
  };

  RequestContextService.run(authenticatedContext, () => next());
}
