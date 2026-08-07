import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';

// A shop's first login is always the owner (backfilled by the
// AddShopStaffRole migration); a cashier invited later by that owner
// (see staff.util.ts) can bill at the counter but not touch catalog data,
// suppliers/purchase orders, financial reports, or invite more staff.
// Runs after attachRole + requireRole('shop'), so req.user.shopId is
// already guaranteed to be set.
export function requireShopOwner(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.user?.shopStaffRole === 'cashier') {
    next(AppError.forbidden('Only the shop owner can do this'));
    return;
  }
  next();
}
