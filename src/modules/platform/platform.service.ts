import { injectable, inject } from 'tsyringe';
import { In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import OpenAI from 'openai';
import { env } from '../../config/env';
import { AppDataSource } from '../../config/database';
import { Tenant } from '../../entities/Tenant';
import { Permission } from '../../entities/Permission';
import { TenantPermission } from '../../entities/TenantPermission';
import { Role } from '../../entities/Role';
import { RolePermission } from '../../entities/RolePermission';
import { User, UserRole } from '../../entities/User';
import { MedicineShop } from '../../entities/MedicineShop';
import {
  MedicineShopPayout,
  MedicineShopPayoutStatus,
} from '../../entities/MedicineShopPayout';
import { PlatformAppConfig } from '../../entities/PlatformAppConfig';
import { Banner } from '../../entities/Banner';
import { Policy } from '../../entities/Policy';
import { AppError } from '../../utils/app-error';
import {
  generateUniqueSubdomain,
  isValidSubdomain,
} from '../../utils/subdomain.util';
import { AuthService } from '../auth/auth.service';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/container';

@injectable()
export class PlatformService {
  constructor(
    private readonly authService: AuthService,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

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
    subdomain?: string;
    address?: string;
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
    let subdomain = data.subdomain?.trim().toLowerCase();
    if (subdomain) {
      if (!isValidSubdomain(subdomain)) {
        throw AppError.badRequest(
          'subdomain must be lowercase letters, numbers, and hyphens only, and not a reserved name',
        );
      }
      if (await tenantRepo.exists({ where: { subdomain } })) {
        throw AppError.conflict('subdomain is already taken');
      }
    } else {
      subdomain = await generateUniqueSubdomain(data.name);
    }

    const tenant = await tenantRepo.save(
      tenantRepo.create({
        name: data.name,
        contactEmail: data.contactEmail,
        whatsappFromNumber: data.whatsappFromNumber,
        address: data.address,
        subdomain,
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
      address: string;
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
    if (data.address !== undefined) tenant.address = data.address;
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

      // Custom roles are a deliberately curated subset — shrinking the
      // tenant's entitlements prunes them here, but growing entitlements
      // should NOT silently hand a limited role new access it was never
      // given. The seeded "Admin" role is different: it's meant to always
      // mirror the tenant's full entitlement set exactly (see createTenant),
      // so it's kept in sync in both directions, not just pruned.
      const toRemove = rolePerms.filter((rp) => !keySet.has(rp.permissionKey));
      if (toRemove.length > 0) {
        await rpRepo.delete({ id: In(toRemove.map((rp) => rp.id)) });
      }

      const systemRoleIds = new Set(
        roles.filter((r) => r.isSystem).map((r) => r.id),
      );
      const grantedBySystemRole = new Map<string, Set<string>>();
      for (const rp of rolePerms) {
        if (!systemRoleIds.has(rp.roleId)) continue;
        if (!grantedBySystemRole.has(rp.roleId)) {
          grantedBySystemRole.set(rp.roleId, new Set());
        }
        grantedBySystemRole.get(rp.roleId)!.add(rp.permissionKey);
      }
      const toAdd: RolePermission[] = [];
      for (const roleId of systemRoleIds) {
        const alreadyGranted = grantedBySystemRole.get(roleId) ?? new Set();
        for (const key of moduleKeys) {
          if (!alreadyGranted.has(key)) {
            toAdd.push(rpRepo.create({ roleId, permissionKey: key }));
          }
        }
      }
      if (toAdd.length > 0) {
        await rpRepo.save(toAdd);
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

  // Grants/revokes a standalone shop's own independent WhatsApp module
  // (provider account + flow builder + sessions, see shop-whatsapp-module
  // .util.ts) — super_admin-only, since this is effectively handing the
  // shop a whole new customer-facing channel plus the ability to store its
  // own WhatsApp Business credentials.
  async setMedicineShopWhatsAppModule(
    shopId: string,
    enabled: boolean,
    fromNumber?: string,
  ): Promise<MedicineShop> {
    const repo = AppDataSource.getRepository(MedicineShop);
    const shop = await repo.findOne({ where: { id: shopId } });
    if (!shop) throw AppError.notFound('Medicine shop');
    shop.whatsappModuleEnabled = enabled;
    shop.whatsappModuleEnabledAt = enabled ? new Date() : undefined;
    if (fromNumber !== undefined) shop.whatsappModuleFromNumber = fromNumber || undefined;
    return repo.save(shop);
  }

  // Reconciliation ledger for the "platform collects, pays shops out
  // later" model — there's no Stripe Connect/Razorpay Route in this
  // codebase (one platform-wide Stripe account), so every patient payment
  // lands with the platform first; this is where that money owed to each
  // shop is tracked and marked settled once paid back outside the app.
  async listShopPayoutSummaries(): Promise<
    { shopId: string; shopName: string; owedCents: number; settledCents: number }[]
  > {
    const payoutRepo = AppDataSource.getRepository(MedicineShopPayout);
    const payouts = await payoutRepo.find();
    if (payouts.length === 0) return [];

    const byShop = new Map<string, { owedCents: number; settledCents: number }>();
    for (const p of payouts) {
      const entry = byShop.get(p.shopId) ?? { owedCents: 0, settledCents: 0 };
      if (p.status === MedicineShopPayoutStatus.OWED) entry.owedCents += p.amountCents;
      else entry.settledCents += p.amountCents;
      byShop.set(p.shopId, entry);
    }

    const shops = await AppDataSource.getRepository(MedicineShop).findBy({
      id: In(Array.from(byShop.keys())),
    });
    const nameById = new Map(shops.map((s) => [s.id, s.name]));

    return Array.from(byShop.entries()).map(([shopId, totals]) => ({
      shopId,
      shopName: nameById.get(shopId) ?? 'Unknown shop',
      ...totals,
    }));
  }

  async listShopPayoutEntries(shopId: string): Promise<MedicineShopPayout[]> {
    return AppDataSource.getRepository(MedicineShopPayout).find({
      where: { shopId },
      order: { createdAt: 'DESC' },
    });
  }

  // Marks every currently-owed entry for a shop as settled — this does NOT
  // move any real money, it records that the platform paid the shop back
  // outside the app (bank transfer/UPI) so the running balance resets.
  async settleShopPayouts(
    shopId: string,
    settledByUserId: string,
    note?: string,
  ): Promise<{ settledCount: number; settledCents: number }> {
    const payoutRepo = AppDataSource.getRepository(MedicineShopPayout);
    const owed = await payoutRepo.find({
      where: { shopId, status: MedicineShopPayoutStatus.OWED },
    });
    if (owed.length === 0) {
      throw AppError.badRequest('Nothing owed to this shop right now');
    }

    const now = new Date();
    owed.forEach((p) => {
      p.status = MedicineShopPayoutStatus.SETTLED;
      p.settledAt = now;
      p.settledByUserId = settledByUserId;
      if (note) p.note = note;
    });
    await payoutRepo.save(owed);

    return {
      settledCount: owed.length,
      settledCents: owed.reduce((sum, p) => sum + p.amountCents, 0),
    };
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

  // ── Global app config (mobile Home screen tabs/quick-actions) ──────────
  // Single row, get-or-create so a missing/deleted row never 500s — the
  // migration seeds one, but this is a safety net.

  async getAppConfig(): Promise<PlatformAppConfig> {
    const repo = AppDataSource.getRepository(PlatformAppConfig);
    const existing = await repo.find({ take: 1 });
    if (existing.length > 0) return existing[0];
    return repo.save(repo.create());
  }

  async updateAppConfig(
    data: Partial<{
      topTabHealth: boolean;
      topTabAiDoctor: boolean;
      topTabWomen: boolean;
      quickActionDoctor: boolean;
      quickActionPharmacy: boolean;
      quickActionPrescription: boolean;
      quickActionHospital: boolean;
      quickActionAmbulance: boolean;
      sectionPromoBanner: boolean;
      sectionTopDoctors: boolean;
      sectionHealthArticles: boolean;
      bottomNavMessage: boolean;
      bottomNavCalendar: boolean;
      bottomNavProfile: boolean;
      supportEmail: string | null;
      legalEntityName: string | null;
      registeredAddress: string | null;
      supportPhone: string | null;
    }>,
  ): Promise<PlatformAppConfig> {
    const config = await this.getAppConfig();
    // The controller destructures every possible field from req.body, so
    // fields the client didn't send arrive here as explicit `undefined` —
    // Object.assign would still copy those over (it doesn't skip
    // undefined-valued keys) and wipe them off the in-memory/returned
    // entity, even though TypeORM's save() itself ignores undefined
    // columns when building the UPDATE. Filter them out first so the
    // response actually reflects the full row.
    const defined = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    Object.assign(config, defined);
    return AppDataSource.getRepository(PlatformAppConfig).save(config);
  }

  // ── Banners (Home screen promo carousel) ────────────────────────────────
  // Global, same scope as PlatformAppConfig — managed on the App Config
  // page, shown to every patient regardless of tenant.

  async listBanners(): Promise<Banner[]> {
    return AppDataSource.getRepository(Banner).find({
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async createBanner(
    data: {
      title: string;
      ctaText?: string;
      ctaLink?: string;
      backgroundColor?: string;
      sortOrder?: number;
      isPublished?: boolean;
    },
    file?: Express.Multer.File,
  ): Promise<Banner> {
    const repo = AppDataSource.getRepository(Banner);
    let imageUrl: string | undefined;
    if (file) {
      const ext = file.originalname.split('.').pop() ?? 'jpg';
      const key = `banners/${Date.now()}.${ext}`;
      imageUrl = await this.storage.upload(key, file.buffer, file.mimetype);
    }
    return repo.save(repo.create({ ...data, imageUrl }));
  }

  async updateBanner(
    id: string,
    data: Partial<{
      title: string;
      ctaText: string;
      ctaLink: string;
      backgroundColor: string;
      sortOrder: number;
      isPublished: boolean;
    }>,
    file?: Express.Multer.File,
  ): Promise<Banner> {
    const repo = AppDataSource.getRepository(Banner);
    const banner = await repo.findOne({ where: { id } });
    if (!banner) throw AppError.notFound('Banner');
    if (file) {
      const ext = file.originalname.split('.').pop() ?? 'jpg';
      const key = `banners/${Date.now()}.${ext}`;
      banner.imageUrl = await this.storage.upload(key, file.buffer, file.mimetype);
    }
    const defined = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    Object.assign(banner, defined);
    return repo.save(banner);
  }

  async deleteBanner(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Banner);
    const banner = await repo.findOne({ where: { id } });
    if (!banner) throw AppError.notFound('Banner');
    await repo.remove(banner);
  }

  // ── Policies (privacy policy, refund policy, terms of service, etc.) ────
  // Global, same scope as Banner/PlatformAppConfig — managed on the
  // Policies admin page, read publicly by modules/policies (health-frontend's
  // /privacy and /policies/[slug] pages).

  async listPolicies(): Promise<Policy[]> {
    return AppDataSource.getRepository(Policy).find({
      order: { createdAt: 'ASC' },
    });
  }

  async createPolicy(data: {
    slug: string;
    title: string;
    content?: string;
    isPublished?: boolean;
  }): Promise<Policy> {
    const repo = AppDataSource.getRepository(Policy);
    const existing = await repo.findOne({ where: { slug: data.slug } });
    if (existing) {
      throw AppError.badRequest(
        `A policy with slug "${data.slug}" already exists`,
      );
    }
    return repo.save(repo.create(data));
  }

  async updatePolicy(
    id: string,
    data: Partial<{
      slug: string;
      title: string;
      content: string;
      isPublished: boolean;
    }>,
  ): Promise<Policy> {
    const repo = AppDataSource.getRepository(Policy);
    const policy = await repo.findOne({ where: { id } });
    if (!policy) throw AppError.notFound('Policy');
    if (data.slug && data.slug !== policy.slug) {
      const clash = await repo.findOne({ where: { slug: data.slug } });
      if (clash) {
        throw AppError.badRequest(
          `A policy with slug "${data.slug}" already exists`,
        );
      }
    }
    const defined = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    Object.assign(policy, defined);
    return repo.save(policy);
  }

  async deletePolicy(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Policy);
    const policy = await repo.findOne({ where: { id } });
    if (!policy) throw AppError.notFound('Policy');
    await repo.remove(policy);
  }

  // Plain one-off completion, deliberately not routed through
  // IAiProvider — that interface is shaped for the patient symptom-checker
  // chat (patientContext, structured symptom extraction) and doesn't fit
  // a single-shot document draft. Uses the same OPENAI_API_KEY/AI_MODEL
  // already configured for that feature.
  async generatePolicyContent(
    title: string,
    instructions?: string,
  ): Promise<string> {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const business = await this.getAppConfig();
    const knownDetails = [
      business.legalEntityName ? `Legal entity name: ${business.legalEntityName}` : null,
      business.supportEmail ? `Support email: ${business.supportEmail}` : null,
      business.supportPhone ? `Support phone: ${business.supportPhone}` : null,
      business.registeredAddress ? `Registered address: ${business.registeredAddress}` : null,
    ].filter(Boolean);

    const systemPrompt = `You draft legal/policy documents for ZyroHealth, a telemedicine and pharmacy platform (mobile app + WhatsApp + website) operating primarily in India, connecting patients with doctors, hospitals, ambulances, and pharmacies.

Ground facts about the platform, use them where relevant instead of generic filler:
- Collects account info (name, phone, email), health info (DOB, gender, blood group, allergies, chronic conditions, prescriptions, consultation history, and for the women's health feature, menstrual cycle tracking), location (for ambulance dispatch and nearby hospitals/pharmacies), and payment info.
- Payments for consultations and medicine orders are processed by Stripe; ZyroHealth does not store full card numbers.
- Other processors: Twilio (SMS/OTP), Firebase (auth/notifications), OpenAI (in-app AI health assistant), LiveKit (voice/video consultations), WhatsApp/Meta (WhatsApp-based interactions).
- Medicine orders are fulfilled by pharmacies/medicine shops on the platform; doctor consultations are booked and paid for in-app.
- Primary jurisdiction is India — reference the Digital Personal Data Protection Act, 2023 where relevant to data/privacy topics.
- Not directed at children under 18; care for minors must be booked by a parent/guardian.

${
  knownDetails.length > 0
    ? `Known business details — use these EXACT values wherever a contact/legal detail is needed, do not paraphrase or invent alternatives:\n${knownDetails.map((d) => `- ${d}`).join('\n')}\n`
    : ''
}
Write in plain text only — no markdown, no HTML, no asterisks for emphasis. Use numbered section headers (e.g. "1. Information We Collect") followed by a blank line, then body paragraphs, with a blank line between sections. Use "-" for bullet lists. Keep it clear, direct, and specific to the facts above rather than generic boilerplate. Do not invent facts not given here or in the admin's notes below (e.g. don't state a specific refund window unless provided). For any concrete detail needed but not supplied above or in the notes (support email, phone, address, specific windows/timeframes, etc.), use a bracketed placeholder like [support email] instead of guessing.`;

    const userPrompt = [
      `Draft a complete "${title}" document for ZyroHealth.`,
      instructions?.trim()
        ? `Additional notes from the platform owner to incorporate:\n${instructions.trim()}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await client.chat.completions.create({
      model: env.AI_MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw AppError.unprocessable('AI returned an empty draft');
    return content;
  }
}
