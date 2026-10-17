import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { RoleType } from '@vargly/types';
import { RequestContextService } from '../services/request-context.service.js';
import { AppError } from '../middleware/error-handler.middleware.js';

/**
 * Platform operators only. This checks the role, not a permission: every institute owner holds
 * the "*" wildcard, so a permission check would let each of them into Vargly's own console.
 */
export function requireSuperAdmin(_req: Request, _res: Response, next: NextFunction): void {
  if (!RequestContextService.getRoles().includes(RoleType.SUPER_ADMIN)) {
    throw new AppError('FORBIDDEN', 'Access denied: platform administrators only', StatusCodes.FORBIDDEN);
  }
  next();
}
