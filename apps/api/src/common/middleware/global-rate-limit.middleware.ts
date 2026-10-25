import { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Redis } from 'ioredis';
import { tokenService } from '../security/token.service.js';
import { rateLimit } from './rate-limit.middleware.js';

export interface GlobalRateLimitOptions {
  /** Requests a minute from one address, signed in or not */
  readonly perIpPerMinute: number;
  /** Requests a minute from one signed-in person, from wherever they come */
  readonly perUserPerMinute: number;
  /** Injectable for tests; defaults to the shared Redis connection */
  readonly redis?: () => Redis;
  /** Paths (below the mount point) that are never limited */
  readonly exempt?: readonly string[];
}

/** Meta's servers call the webhook in bursts from their own addresses; it is checked by its signature instead */
const DEFAULT_EXEMPT = ['/notifications/webhook'];

/** The person behind a valid access token, or nothing: an anonymous caller is limited by address only */
function userKey(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  try {
    return `user:${tokenService.verifyAccessToken(header.substring(7).trim()).sub}`;
  } catch {
    return undefined;
  }
}

/**
 * A ceiling on the whole API, on top of the tighter limits on login, OTP and the public pages. It
 * is generous on purpose (an institute's office shares one address, and a dashboard makes many
 * calls): it stops floods and runaway scripts, not normal use. Two limits: one per address, and one
 * per signed-in person, so one account cannot hammer the API from many addresses.
 */
export function globalRateLimit(options: GlobalRateLimitOptions): RequestHandler {
  const exempt = options.exempt ?? DEFAULT_EXEMPT;
  const perIp = rateLimit({ name: 'api-ip', windowSeconds: 60, max: options.perIpPerMinute, redis: options.redis });
  const perUser = rateLimit({
    name: 'api-user',
    windowSeconds: 60,
    max: options.perUserPerMinute,
    keyGenerator: userKey,
    redis: options.redis,
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (exempt.some((path) => req.path === path || req.path.startsWith(`${path}/`))) return next();
    perIp(req, res, (error?: unknown) => {
      if (error) return next(error);
      perUser(req, res, next);
    });
  };
}
