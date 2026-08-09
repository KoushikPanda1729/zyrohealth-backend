import { AppDataSource } from '../../config/database';
import { MedicineShopRole } from '../../entities/MedicineShopRole';
import { MedicineShopRolePermission } from '../../entities/MedicineShopRolePermission';
import { Permission } from '../../entities/Permission';
import { User, UserRole, ShopStaffRole } from '../../entities/User';
import { AppError } from '../../utils/app-error';

// Only these permission keys are ever assignable to a shop role — the
// module='shop_staff' rows seeded by the AddShopStaffRolesAttendance...
// migration. Kept as a live catalog lookup (not hardcoded) so new keys
// added by future migrations show up automatically.
export async function listAssignableShopPermissions(): Promise<Permission[]> {
  return AppDataSource.getRepository(Permission).find({
    where: { module: 'shop_staff' },
    order: { key: 'ASC' },
  });
}

// A non-owner shop user's effective permissions — the owner never calls
// this (attachRole.middleware.ts short-circuits to ['*'] for them).
// Falls back to no permissions (not an error) if a role was deleted out
// from under a staff member, rather than 500ing every request they make.
export async function resolveShopEffectivePermissions(
  shopRoleId: string | null | undefined,
): Promise<string[]> {
  if (!shopRoleId) return [];
  const perms = await AppDataSource.getRepository(MedicineShopRolePermission).find({
    where: { roleId: shopRoleId },
  });
  return perms.map((p) => p.permissionKey);
}

export async function listShopRoles(shopId: string): Promise<MedicineShopRole[]> {
  return AppDataSource.getRepository(MedicineShopRole).find({
    where: { shopId },
    order: { createdAt: 'ASC' },
  });
}

export async function getShopRole(
  shopId: string,
  id: string,
): Promise<MedicineShopRole & { permissionKeys: string[] }> {
  const role = await AppDataSource.getRepository(MedicineShopRole).findOne({
    where: { id, shopId },
  });
  if (!role) throw AppError.notFound('Role');
  const perms = await AppDataSource.getRepository(MedicineShopRolePermission).find({
    where: { roleId: id },
  });
  return { ...role, permissionKeys: perms.map((p) => p.permissionKey) };
}

async function assertPermissionsExist(permissionKeys: string[]): Promise<void> {
  if (permissionKeys.length === 0) return;
  const assignable = await listAssignableShopPermissions();
  const validKeys = new Set(assignable.map((p) => p.key));
  const invalid = permissionKeys.filter((k) => !validKeys.has(k));
  if (invalid.length > 0) {
    throw AppError.badRequest(`Not a valid shop permission: ${invalid.join(', ')}`);
  }
}

export async function createShopRole(
  shopId: string,
  name: string,
  description: string | undefined,
  permissionKeys: string[],
): Promise<MedicineShopRole> {
  await assertPermissionsExist(permissionKeys);

  const roleRepo = AppDataSource.getRepository(MedicineShopRole);
  const role = await roleRepo.save(
    roleRepo.create({ shopId, name, description, isSystem: false }),
  );

  if (permissionKeys.length > 0) {
    const rpRepo = AppDataSource.getRepository(MedicineShopRolePermission);
    await rpRepo.save(
      permissionKeys.map((key) => rpRepo.create({ roleId: role.id, permissionKey: key })),
    );
  }
  return role;
}

export async function updateShopRole(
  shopId: string,
  id: string,
  data: { name?: string; description?: string; permissionKeys?: string[] },
): Promise<MedicineShopRole> {
  const repo = AppDataSource.getRepository(MedicineShopRole);
  const role = await repo.findOne({ where: { id, shopId } });
  if (!role) throw AppError.notFound('Role');

  if (data.name !== undefined) role.name = data.name;
  if (data.description !== undefined) role.description = data.description;
  await repo.save(role);

  if (data.permissionKeys !== undefined) {
    await assertPermissionsExist(data.permissionKeys);
    const rpRepo = AppDataSource.getRepository(MedicineShopRolePermission);
    await rpRepo.delete({ roleId: id });
    if (data.permissionKeys.length > 0) {
      await rpRepo.save(
        data.permissionKeys.map((key) => rpRepo.create({ roleId: id, permissionKey: key })),
      );
    }
  }
  return role;
}

export async function deleteShopRole(shopId: string, id: string): Promise<void> {
  const repo = AppDataSource.getRepository(MedicineShopRole);
  const role = await repo.findOne({ where: { id, shopId } });
  if (!role) throw AppError.notFound('Role');
  if (role.isSystem) throw AppError.forbidden('Cannot delete the default system role');

  const staffOnRole = await AppDataSource.getRepository(User).count({
    where: { shopRoleId: id },
  });
  if (staffOnRole > 0) {
    throw AppError.badRequest(
      `${staffOnRole} staff member(s) are assigned this role — reassign them first`,
    );
  }

  await AppDataSource.getRepository(MedicineShopRolePermission).delete({ roleId: id });
  await repo.remove(role);
}

export async function assignShopStaffRole(
  shopId: string,
  staffId: string,
  roleId: string,
): Promise<User> {
  const userRepo = AppDataSource.getRepository(User);
  const staff = await userRepo.findOne({ where: { id: staffId, shopId, role: UserRole.SHOP } });
  if (!staff) throw AppError.notFound('Staff account');
  if (staff.shopStaffRole === ShopStaffRole.OWNER) {
    throw AppError.badRequest("The owner doesn't need a role — they already have full access");
  }

  const role = await AppDataSource.getRepository(MedicineShopRole).findOne({
    where: { id: roleId, shopId },
  });
  if (!role) throw AppError.notFound('Role');

  staff.shopRoleId = role.id;
  return userRepo.save(staff);
}
