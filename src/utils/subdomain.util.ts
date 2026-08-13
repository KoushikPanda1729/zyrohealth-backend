import { AppDataSource } from '../config/database';
import { Tenant } from '../entities/Tenant';

// Names that already route to a fixed app (app./api./admin./monitor.), plus
// www — no tenant may ever claim one of these as its own portal subdomain.
export const RESERVED_SUBDOMAINS = new Set([
  'app',
  'api',
  'admin',
  'monitor',
  'www',
]);

export function slugifySubdomain(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function isValidSubdomain(subdomain: string): boolean {
  return (
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain) &&
    !RESERVED_SUBDOMAINS.has(subdomain)
  );
}

// Slugifies `name` and appends "-2", "-3", ... until it finds a subdomain
// no other tenant already has. Used both when an admin creates a tenant
// without specifying one explicitly, and by the historical backfill.
export async function generateUniqueSubdomain(name: string): Promise<string> {
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const base = slugifySubdomain(name) || 'tenant';
  let candidate = base;
  let suffix = 2;
  while (
    RESERVED_SUBDOMAINS.has(candidate) ||
    (await tenantRepo.exists({ where: { subdomain: candidate } }))
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
