import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';

declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        phone: string;
        id?: string;
        role?: string;
        tenantId?: string;
        roleId?: string;
        shopId?: string;
        shopStaffRole?: string;
        shopRoleId?: string;
        permissions?: string[];
        isActive?: boolean;
        canCreateAgent?: boolean;
        fullUser?: unknown;
        // Only present on a tenant admin's "Open Full View" into their own
        // in-house shop — see attachRole.middleware.ts.
        actingShopId?: string;
      };
    }
  }
}

export function verifyToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw AppError.unauthorized();

    const token = authHeader.slice(7);
    if (!token) throw AppError.unauthorized();

    const payload = jwt.verify(token, env.JWT_SECRET) as {
      uid: string;
      phone: string;
      id?: string;
      actingShopId?: string;
    };

    req.user = {
      uid: payload.uid,
      phone: payload.phone,
      id: payload.id,
      actingShopId: payload.actingShopId,
    };
    next();
  } catch {
    next(AppError.unauthorized());
  }
}
