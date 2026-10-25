import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { RoleType } from '@vargly/types';
import { RequestContextService } from '../services/request-context.service.js';
import { AppError } from '../middleware/error-handler.middleware.js';

/**
 * For the few routes that any signed-in person could use (they check no permission): students
 * are turned away. A student has one permission, the portal's, and nothing on staff's side should
 * open for it, so a route with no permission check of its own must say so here.
 */
export function denyStudents(_req: Request, _res: Response, next: NextFunction): void {
  if (RequestContextService.getRoles().includes(RoleType.STUDENT)) {
    throw new AppError('FORBIDDEN', 'Access denied: this is not available to students', StatusCodes.FORBIDDEN);
  }
  next();
}
