import { MigrationInterface, QueryRunner } from 'typeorm';

// One-time backfill for tenants created before the subdomain column
// existed (see 1780000039000-AddTenantSubdomain.ts). Slugifies each
// tenant's name; safe here because every pre-existing tenant at the time
// of writing is test/dev data with no real branding to preserve. Any
// tenant created going forward should have its subdomain set explicitly
// at creation time instead of relying on this.
export class BackfillTenantSubdomains1780000040000
  implements MigrationInterface
{
  name = 'BackfillTenantSubdomains1780000040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "tenants"
      SET "subdomain" = trim(
        both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
      )
      WHERE "subdomain" IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Intentionally a no-op — reverting would blow away subdomains that
    // may have been deliberately customized after this ran.
  }
}
