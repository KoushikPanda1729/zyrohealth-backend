import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';

export function requirePermission(
  key: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user?.role) {
      next(AppError.unauthorized());
      return;
    }

    const permissions = req.user.permissions ?? [];
    if (permissions.includes('*') || permissions.includes(key)) {
      next();
      return;
    }

    next(AppError.forbidden());
  };
}
