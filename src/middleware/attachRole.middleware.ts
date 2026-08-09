import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { User, UserRole, ShopStaffRole } from '../entities/User';
import { AppError } from '../utils/app-error';
import {
  resolveEffectivePermissions,
  getDefaultTenantId,
} from '../modules/tenancy/permissions.util';
import { resolveShopEffectivePermissions } from '../modules/medicine-shops/shop-role.util';

export async function attachRole(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user?.uid) {
      throw AppError.unauthorized();
    }

    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOne({
      where: { firebaseUid: req.user.uid },
      relations: ['patientProfile', 'doctorProfile'],
    });

    if (!user) {
      user = userRepo.create({
        firebaseUid: req.user.uid,
        phoneNumber: req.user.phone,
        role: UserRole.PATIENT,
        isActive: true,
        tenantId: await getDefaultTenantId(),
      });
      await userRepo.save(user);
    }

    if (!user.isActive) {
      throw AppError.forbidden();
    }

    let permissions: string[] = [];
    if (user.role === UserRole.SUPER_ADMIN) {
      permissions = ['*'];
    } else if (user.role === UserRole.PLATFORM_SUPPORT) {
      // No tenant-scoped permissions to resolve — its access is entirely
      // decided by which platform.routes.ts routes allow this role (view
      // only), not by anything in the tenant permission catalog.
      permissions = [];
    } else if (user.role === UserRole.ADMIN && user.roleId && user.tenantId) {
      permissions = await resolveEffectivePermissions(
        user.tenantId,
        user.roleId,
      );
    } else if (user.role === UserRole.SHOP) {
      // The owner always has full access within their own shop — never
      // gated by the role/permission catalog, same as super_admin.
      permissions =
        user.shopStaffRole === ShopStaffRole.OWNER
          ? ['*']
          : await resolveShopEffectivePermissions(user.shopRoleId);
    }

    req.user = {
      ...req.user,
      id: user.id,
      role: user.role,
      tenantId: user.tenantId ?? undefined,
      roleId: user.roleId ?? undefined,
      shopId: user.shopId ?? undefined,
      shopStaffRole: user.shopStaffRole ?? undefined,
      shopRoleId: user.shopRoleId ?? undefined,
      permissions,
      isActive: user.isActive,
      canCreateAgent: user.canCreateAgent,
      fullUser: user,
    };

    next();
  } catch (err) {
    next(err);
  }
}
