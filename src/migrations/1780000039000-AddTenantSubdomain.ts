import { MigrationInterface, QueryRunner } from 'typeorm';

// Enables per-tenant admin portals at <subdomain>.zyrohealthai.com. Nullable
// because existing tenants need a one-time backfill (see the accompanying
// backfill script) before this can be made required; new tenants should
// always set one going forward.
export class AddTenantSubdomain1780000039000 implements MigrationInterface {
  name = 'AddTenantSubdomain1780000039000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subdomain" character varying(63)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenants_subdomain" ON "tenants" ("subdomain") WHERE "subdomain" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenants_subdomain"`);
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "subdomain"`,
    );
  }
}
