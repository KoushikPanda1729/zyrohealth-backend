import { AppDataSource } from '../../config/database';
import { Tenant } from '../../entities/Tenant';
import { TenantPermission } from '../../entities/TenantPermission';
import { RolePermission } from '../../entities/RolePermission';

// The pre-multi-tenancy app becomes this tenant. Used to backfill any
// signup path that doesn't yet pass an explicit tenantId (today's app has
// no per-tenant signup surface).
export async function getDefaultTenantId(): Promise<string | undefined> {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { name: 'HealthPlus' },
  });
  return tenant?.id;
}

// A role's effective permissions are always intersected against the
// tenant's currently-active entitlements — revoking a tenant's module
// access immediately revokes it from every role in that tenant, even if
// the role itself still references the permission key.
export async function resolveEffectivePermissions(
  tenantId: string,
  roleId: string,
): Promise<string[]> {
  const [tenantPerms, rolePerms] = await Promise.all([
    AppDataSource.getRepository(TenantPermission).find({
      where: { tenantId, isActive: true },
    }),
    AppDataSource.getRepository(RolePermission).find({ where: { roleId } }),
  ]);

  const activeTenantKeys = new Set(tenantPerms.map((tp) => tp.permissionKey));
  const roleKeys = rolePerms.map((rp) => rp.permissionKey);

  return roleKeys.filter((key) => activeTenantKeys.has(key));
}

export async function listTenantEntitledKeys(
  tenantId: string,
): Promise<Set<string>> {
  const tenantPerms = await AppDataSource.getRepository(TenantPermission).find({
    where: { tenantId, isActive: true },
  });
  return new Set(tenantPerms.map((tp) => tp.permissionKey));
}

// Inbound WhatsApp webhooks have no auth context — the tenant is resolved
// from which number RECEIVED the message. Falls back to the default tenant
// so a single-number deployment (today's app) needs zero configuration.
export async function resolveTenantIdForNumber(
  toNumber?: string,
): Promise<string> {
  if (toNumber) {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { whatsappFromNumber: toNumber },
    });
    if (tenant) return tenant.id;
  }
  const defaultId = await getDefaultTenantId();
  if (!defaultId) throw new Error('No default tenant configured');
  return defaultId;
}
