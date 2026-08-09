import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../../config/database';
import { User, UserRole, ShopStaffRole } from '../../entities/User';
import { MedicineShopRole } from '../../entities/MedicineShopRole';
import { AppError } from '../../utils/app-error';
import { AuthService } from '../auth/auth.service';

export async function listShopStaff(shopId: string): Promise<User[]> {
  return AppDataSource.getRepository(User).find({
    where: { shopId, role: UserRole.SHOP },
    order: { createdAt: 'ASC' },
  });
}

// Only the owner ever reaches this (see requireShopOwner.middleware.ts on
// the route) — invites a second (or third...) login for the SAME shop,
// tagged 'cashier' so it gets the lighter access tier. Same invite-link-
// or-immediate-password pattern used for every other account creation in
// this codebase (createPlatformSupportAccount, createTenantAdmin, etc.).
export async function inviteShopStaff(
  authService: AuthService,
  shopId: string,
  tenantId: string,
  data: { fullName: string; email: string; password?: string; shopRoleId?: string },
): Promise<{ user: User; inviteLink?: string }> {
  const userRepo = AppDataSource.getRepository(User);
  const existing = await userRepo.findOne({ where: { email: data.email } });
  if (existing) throw AppError.conflict('Email already in use');

  let shopRoleId: string | undefined = data.shopRoleId;
  if (shopRoleId) {
    const role = await AppDataSource.getRepository(MedicineShopRole).findOne({
      where: { id: shopRoleId, shopId },
    });
    if (!role) throw AppError.badRequest('Invalid role for this shop');
  } else {
    // No role picked — fall back to the shop's auto-seeded default
    // Cashier role, same as every shop had before custom roles existed.
    const defaultRole = await AppDataSource.getRepository(MedicineShopRole).findOne({
      where: { shopId, isSystem: true },
    });
    shopRoleId = defaultRole?.id;
  }

  const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : undefined;
  const user = userRepo.create({
    firebaseUid: `shop_staff_${data.email}`,
    email: data.email,
    fullName: data.fullName,
    passwordHash,
    role: UserRole.SHOP,
    shopId,
    tenantId,
    shopStaffRole: ShopStaffRole.CASHIER,
    shopRoleId,
    isActive: true,
  });
  await userRepo.save(user);

  let inviteLink: string | undefined;
  if (!data.password) {
    const rawToken = await authService.createInviteToken(user.id);
    inviteLink = authService.buildInviteLink(rawToken);
  }
  return { user, inviteLink };
}

// The owner can ban/unban a cashier, but never themselves (that would
// lock the shop out of its own staff management with no one left who can
// undo it) — the owner row is the one seeded at shop-onboarding time,
// identified by shopStaffRole === 'owner'.
export async function toggleShopStaffActive(shopId: string, staffId: string): Promise<User> {
  const repo = AppDataSource.getRepository(User);
  const staff = await repo.findOne({ where: { id: staffId, shopId, role: UserRole.SHOP } });
  if (!staff) throw AppError.notFound('Staff account');
  if (staff.shopStaffRole === ShopStaffRole.OWNER) {
    throw AppError.badRequest("Can't deactivate the shop owner's own login");
  }
  staff.isActive = !staff.isActive;
  return repo.save(staff);
}
