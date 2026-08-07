import { injectable } from 'tsyringe';
import { In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AppDataSource } from '../../config/database';
import { Tenant } from '../../entities/Tenant';
import { Permission } from '../../entities/Permission';
import { TenantPermission } from '../../entities/TenantPermission';
import { Role } from '../../entities/Role';
import { RolePermission } from '../../entities/RolePermission';
import { User, UserRole } from '../../entities/User';
import { MedicineShop } from '../../entities/MedicineShop';
import { AppError } from '../../utils/app-error';
import { AuthService } from '../auth/auth.service';

@injectable()
export class PlatformService {
  constructor(private readonly authService: AuthService) {}

  private async assertKnownPermissionKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const catalog = await AppDataSource.getRepository(Permission).find();
    const validKeys = new Set(catalog.map((p) => p.key));
    const invalid = keys.filter((k) => !validKeys.has(k));
    if (invalid.length > 0) {
      throw AppError.badRequest(
        `Unknown permission keys: ${invalid.join(', ')}`,
      );
    }
  }

  async listPermissionsCatalog(): Promise<Permission[]> {
    return AppDataSource.getRepository(Permission).find({
      order: { module: 'ASC', key: 'ASC' },
    });
  }

  // Excludes standalone-medicine-shop tenants — they have no admin, no
  // doctors/bookings, nothing a "Tenants" list is for; they're only ever
  // managed from the Medicine Shops page.
  async listTenants(): Promise<Tenant[]> {
    return AppDataSource.getRepository(Tenant).find({
      where: { isStandaloneMedicineShop: false },
      order: { createdAt: 'DESC' },
    });
  }

  async getTenantDetail(
    id: string,
  ): Promise<Tenant & { enabledModules: string[] }> {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id },
    });
    if (!tenant) throw AppError.notFound('Tenant');
    const perms = await AppDataSource.getRepository(TenantPermission).find({
      where: { tenantId: id, isActive: true },
    });
    return { ...tenant, enabledModules: perms.map((p) => p.permissionKey) };
  }

  // Creates a tenant, entitles it to the requested permission keys, seeds
  // its default "Admin" role with those same keys, and provisions its first
  // admin user — mirroring the existing inviteDoctor pattern, but via
  // email+password since tenant admins log in through adminLogin, not OTP.
  async createTenant(data: {
    name: string;
    contactEmail?: string;
    whatsappFromNumber?: string;
    moduleKeys: string[];
    adminEmail: string;
    adminFullName: string;
  }): Promise<{ tenant: Tenant; adminUser: User; tempPassword: string }> {
    await this.assertKnownPermissionKeys(data.moduleKeys);

    const userRepo = AppDataSource.getRepository(User);
    const existingUser = await userRepo.findOne({
      where: { email: data.adminEmail },
    });
    if (existingUser) throw AppError.conflict('Email already in use');

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = await tenantRepo.save(
      tenantRepo.create({
        name: data.name,
        contactEmail: data.contactEmail,
        whatsappFromNumber: data.whatsappFromNumber,
        isActive: true,
      }),
    );

    const tpRepo = AppDataSource.getRepository(TenantPermission);
    if (data.moduleKeys.length > 0) {
      await tpRepo.save(
        data.moduleKeys.map((key) =>
          tpRepo.create({
            tenantId: tenant.id,
            permissionKey: key,
            isActive: true,
          }),
        ),
      );
    }

    const roleRepo = AppDataSource.getRepository(Role);
    const adminRole = await roleRepo.save(
      roleRepo.create({ tenantId: tenant.id, name: 'Admin', isSystem: true }),
    );
    const rpRepo = AppDataSource.getRepository(RolePermission);
    if (data.moduleKeys.length > 0) {
      await rpRepo.save(
        data.moduleKeys.map((key) =>
          rpRepo.create({ roleId: adminRole.id, permissionKey: key }),
        ),
      );
    }

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const adminUser = userRepo.create({
      firebaseUid: `admin_${data.adminEmail}`,
      email: data.adminEmail,
      fullName: data.adminFullName,
      passwordHash,
      role: UserRole.ADMIN,
      tenantId: tenant.id,
      roleId: adminRole.id,
      isActive: true,
    });
    await userRepo.save(adminUser);

    return { tenant, adminUser, tempPassword };
  }

  // A standalone medicine shop — a real-world pharmacy business signing up
  // for JUST inventory/quoting management, with no clinic behind it. Given
  // every MedicineShop row and every permission/module-entitlement check in
  // this codebase hangs off a tenantId, the cleanest way to model "no
  // clinic" without a parallel schema is a dedicated Tenant per shop, scoped
  // to only the medicine_shops.* permissions — same entitlement mechanism
  // used to gate any other tenant's modules, just always this one pair here.
  // Their actual login is a shop-role account (not a tenant admin), landing
  // them straight in the polished shop portal (dashboard/requests/full
  // inventory) built for exactly this — a generic permission-gated admin
  // shell showing only two menu items would be a much worse experience.
  async createStandaloneMedicineShop(data: {
    shopName: string;
    contactPhone: string;
    contactEmail?: string;
    addressLine1?: string;
    city?: string;
    loginEmail: string;
    loginFullName: string;
    loginPassword?: string;
  }): Promise<{
    tenant: Tenant;
    shop: MedicineShop;
    user: User;
    inviteLink?: string;
  }> {
    const userRepo = AppDataSource.getRepository(User);
    const existingUser = await userRepo.findOne({
      where: { email: data.loginEmail },
    });
    if (existingUser) throw AppError.conflict('Email already in use');

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = await tenantRepo.save(
      tenantRepo.create({
        name: data.shopName,
        contactEmail: data.contactEmail,
        isActive: true,
        isStandaloneMedicineShop: true,
      }),
    );

    // Includes .dispatch alongside .view/.manage so an admin-style login
    // invited to this tenant later (see createTenantAdmin) can actually
    // edit the catalog/dispatch — not just view and onboard/invite. A
    // standalone shop's own shop-role login is unaffected by this either
    // way (it bypasses the permission catalog entirely).
    const moduleKeys = ['medicine_shops.view', 'medicine_shops.manage', 'medicine_shops.dispatch'];
    const tpRepo = AppDataSource.getRepository(TenantPermission);
    await tpRepo.save(
      moduleKeys.map((key) =>
        tpRepo.create({
          tenantId: tenant.id,
          permissionKey: key,
          isActive: true,
        }),
      ),
    );

    // Seeded even though the shop's own login bypasses the permission
    // catalog entirely — keeps this tenant consistent with every other
    // tenant's shape in case they later want to invite additional staff
    // with a regular admin-style login too.
    const roleRepo = AppDataSource.getRepository(Role);
    const adminRole = await roleRepo.save(
      roleRepo.create({ tenantId: tenant.id, name: 'Admin', isSystem: true }),
    );
    const rpRepo = AppDataSource.getRepository(RolePermission);
    await rpRepo.save(
      moduleKeys.map((key) =>
        rpRepo.create({ roleId: adminRole.id, permissionKey: key }),
      ),
    );

    const shopRepo = AppDataSource.getRepository(MedicineShop);
    const shop = await shopRepo.save(
      shopRepo.create({
        tenantId: tenant.id,
        name: data.shopName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        addressLine1: data.addressLine1,
        city: data.city,
      }),
    );

    const passwordHash = data.loginPassword
      ? await bcrypt.hash(data.loginPassword, 12)
      : undefined;
    const user = userRepo.create({
      firebaseUid: `shop_${data.loginEmail}`,
      email: data.loginEmail,
      fullName: data.loginFullName,
      passwordHash,
      role: UserRole.SHOP,
      tenantId: tenant.id,
      shopId: shop.id,
      isActive: true,
    });
    await userRepo.save(user);

    let inviteLink: string | undefined;
    if (!data.loginPassword) {
      const rawToken = await this.authService.createInviteToken(user.id);
      inviteLink = this.authService.buildInviteLink(rawToken);
    }

    return { tenant, shop, user, inviteLink };
  }

  async updateTenant(
    id: string,
    data: Partial<{
      name: string;
      contactEmail: string;
      whatsappFromNumber: string;
      isActive: boolean;
    }>,
  ): Promise<Tenant> {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id } });
    if (!tenant) throw AppError.notFound('Tenant');

    if (data.isActive === false && tenant.isActive) {
      tenant.deactivatedAt = new Date();
    }
    if (data.name !== undefined) tenant.name = data.name;
    if (data.contactEmail !== undefined)
      tenant.contactEmail = data.contactEmail;
    if (data.whatsappFromNumber !== undefined)
      tenant.whatsappFromNumber = data.whatsappFromNumber;
    if (data.isActive !== undefined) tenant.isActive = data.isActive;

    return repo.save(tenant);
  }

  // Replaces the tenant's entitlement set wholesale, then cascades: strips
  // any role_permissions in this tenant that reference a now-disallowed
  // key, so a stale grant can never re-surface after a module is revoked.
  async updateTenantEntitlements(
    tenantId: string,
    moduleKeys: string[],
  ): Promise<TenantPermission[]> {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: tenantId },
    });
    if (!tenant) throw AppError.notFound('Tenant');
    await this.assertKnownPermissionKeys(moduleKeys);

    const tpRepo = AppDataSource.getRepository(TenantPermission);
    await tpRepo.delete({ tenantId });
    const rows =
      moduleKeys.length > 0
        ? await tpRepo.save(
            moduleKeys.map((key) =>
              tpRepo.create({ tenantId, permissionKey: key, isActive: true }),
            ),
          )
        : [];

    const roles = await AppDataSource.getRepository(Role).find({
      where: { tenantId },
    });
    const roleIds = roles.map((r) => r.id);
    if (roleIds.length > 0) {
      const keySet = new Set(moduleKeys);
      const rpRepo = AppDataSource.getRepository(RolePermission);
      const rolePerms = await rpRepo.find({ where: { roleId: In(roleIds) } });
      const toRemove = rolePerms.filter((rp) => !keySet.has(rp.permissionKey));
      if (toRemove.length > 0) {
        await rpRepo.delete({ id: In(toRemove.map((rp) => rp.id)) });
      }
    }

    return rows;
  }

  // Lets a super admin drop into a tenant's admin view for support/setup —
  // logs in as that tenant's original admin account (the one created
  // alongside the tenant) without needing its password. No separate
  // "acting as" flag is issued; the frontend is responsible for stashing
  // the super admin's own session so it can switch back.
  async impersonateTenant(
    tenantId: string,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: tenantId },
    });
    if (!tenant) throw AppError.notFound('Tenant');
    if (!tenant.isActive) {
      throw AppError.badRequest('Cannot switch into a deactivated tenant');
    }

    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOne({
      where: { tenantId, role: UserRole.ADMIN },
      order: { createdAt: 'ASC' },
    });
    // A standalone medicine-shop tenant (see createStandaloneMedicineShop)
    // never gets an admin account — its only login is the shop-role user
    // itself, so that's who "switching into" this tenant actually means.
    if (!user) {
      user = await userRepo.findOne({
        where: { tenantId, role: UserRole.SHOP },
        order: { createdAt: 'ASC' },
      });
    }
    if (!user) {
      throw AppError.notFound('This tenant has no admin or shop account yet');
    }

    const { accessToken, refreshToken } =
      await this.authService.issueTokens(user);
    return { user, accessToken, refreshToken };
  }

  // ── Tenant admins — platform-wide visibility across every tenant ────
  // Note: unlike some multi-tenant systems, a single admin account here
  // belongs to exactly one tenant (User.tenantId is singular) — this lists
  // every tenant's admin(s) in one place rather than modeling one admin
  // shared across several tenants.

  async listTenantAdmins(): Promise<(User & { tenantName?: string })[]> {
    const admins = await AppDataSource.getRepository(User).find({
      where: { role: UserRole.ADMIN },
      order: { createdAt: 'DESC' },
    });
    const tenantIds = [
      ...new Set(
        admins.map((a) => a.tenantId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const tenants = tenantIds.length
      ? await AppDataSource.getRepository(Tenant).findBy({ id: In(tenantIds) })
      : [];
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));
    return admins.map((a) => ({
      ...a,
      tenantName: a.tenantId ? tenantMap.get(a.tenantId) : undefined,
    }));
  }

  // ── Medicine shops — platform-wide visibility across every tenant ───
  // A shop is always onboarded under exactly one tenant (see
  // MedicineShop.tenantId), so there's no separate top-level "shop" record
  // to manage here — this is a read-only cross-tenant registry so a super
  // admin can see every shop (in-house or third-party) without switching
  // into each tenant one at a time. Actual onboarding/editing still
  // happens inside that tenant's own Medicine Shops page.
  async listMedicineShopsAcrossTenants(): Promise<
    (MedicineShop & {
      tenantName?: string;
      isStandaloneMedicineShop?: boolean;
    })[]
  > {
    const shops = await AppDataSource.getRepository(MedicineShop).find({
      order: { createdAt: 'DESC' },
    });
    const tenantIds = [...new Set(shops.map((s) => s.tenantId))];
    const tenants = tenantIds.length
      ? await AppDataSource.getRepository(Tenant).findBy({ id: In(tenantIds) })
      : [];
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    return shops.map((s) => {
      const tenant = tenantMap.get(s.tenantId);
      return {
        ...s,
        tenantName: tenant?.name,
        isStandaloneMedicineShop: tenant?.isStandaloneMedicineShop ?? false,
      };
    });
  }

  async createTenantAdmin(data: {
    fullName: string;
    email: string;
    tenantId: string;
    password?: string;
  }): Promise<{ user: User; inviteLink?: string }> {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: data.tenantId },
    });
    if (!tenant) throw AppError.notFound('Tenant');

    const userRepo = AppDataSource.getRepository(User);
    const existing = await userRepo.findOne({ where: { email: data.email } });
    if (existing) throw AppError.conflict('Email already in use');

    const adminRole = await AppDataSource.getRepository(Role).findOne({
      where: { tenantId: data.tenantId, name: 'Admin', isSystem: true },
    });
    if (!adminRole) {
      throw AppError.notFound("This tenant's default Admin role");
    }

    // A password set explicitly activates the account immediately with
    // that password. Leaving it blank creates the account with no password
    // at all (login stays blocked) and issues a one-time invite link
    // instead — the invited person sets their own password by opening it.
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 12)
      : undefined;
    const user = userRepo.create({
      firebaseUid: `admin_${data.email}`,
      email: data.email,
      fullName: data.fullName,
      passwordHash,
      role: UserRole.ADMIN,
      tenantId: data.tenantId,
      roleId: adminRole.id,
      isActive: true,
    });
    await userRepo.save(user);

    let inviteLink: string | undefined;
    if (!data.password) {
      const rawToken = await this.authService.createInviteToken(user.id);
      inviteLink = this.authService.buildInviteLink(rawToken);
    }

    return { user, inviteLink };
  }

  async updateTenantAdmin(
    id: string,
    data: { fullName?: string; email?: string },
  ): Promise<User> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id, role: UserRole.ADMIN } });
    if (!user) throw AppError.notFound('Tenant admin');

    if (data.email !== undefined && data.email !== user.email) {
      const existing = await repo.findOne({ where: { email: data.email } });
      if (existing) throw AppError.conflict('Email already in use');
      user.email = data.email;
    }
    if (data.fullName !== undefined) user.fullName = data.fullName;

    return repo.save(user);
  }

  async toggleTenantAdminActive(id: string): Promise<User> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id, role: UserRole.ADMIN } });
    if (!user) throw AppError.notFound('Tenant admin');
    user.isActive = !user.isActive;
    return repo.save(user);
  }

  // ── Platform Support — a lighter tier that can view every tenant/shop
  // for troubleshooting without being able to create/edit/deactivate/
  // impersonate/invite anything (see platform.routes.ts's read/write
  // split). Not tenant-scoped at all, unlike every other actor in this app.

  async listPlatformSupportAccounts(): Promise<User[]> {
    return AppDataSource.getRepository(User).find({
      where: { role: UserRole.PLATFORM_SUPPORT },
      order: { createdAt: 'DESC' },
    });
  }

  async createPlatformSupportAccount(data: {
    fullName: string;
    email: string;
    password?: string;
  }): Promise<{ user: User; inviteLink?: string }> {
    const userRepo = AppDataSource.getRepository(User);
    const existing = await userRepo.findOne({ where: { email: data.email } });
    if (existing) throw AppError.conflict('Email already in use');

    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 12)
      : undefined;
    const user = userRepo.create({
      firebaseUid: `platform_support_${data.email}`,
      email: data.email,
      fullName: data.fullName,
      passwordHash,
      role: UserRole.PLATFORM_SUPPORT,
      isActive: true,
    });
    await userRepo.save(user);

    let inviteLink: string | undefined;
    if (!data.password) {
      const rawToken = await this.authService.createInviteToken(user.id);
      inviteLink = this.authService.buildInviteLink(rawToken);
    }
    return { user, inviteLink };
  }

  async togglePlatformSupportActive(id: string): Promise<User> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({
      where: { id, role: UserRole.PLATFORM_SUPPORT },
    });
    if (!user) throw AppError.notFound('Platform support account');
    user.isActive = !user.isActive;
    return repo.save(user);
  }
}
