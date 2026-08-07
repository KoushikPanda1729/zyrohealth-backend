import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';

export function requireRole(
  ...roles: string[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user?.role) {
      next(AppError.unauthorized());
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }

    next();
  };
}
