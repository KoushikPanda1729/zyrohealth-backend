import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantAndRoleToUsers1780000013000 implements MigrationInterface {
  name = 'AddTenantAndRoleToUsers1780000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "tenant_id" character varying,
        ADD COLUMN IF NOT EXISTS "role_id" character varying
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_tenant_id" ON "users" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_role_id" ON "users" ("role_id")`,
    );

    // Backfill every existing user into the default tenant, seeded by the
    // previous migration.
    await queryRunner.query(`
      UPDATE "users"
      SET "tenant_id" = (SELECT id FROM "tenants" WHERE name = 'HealthPlus' LIMIT 1)
      WHERE "tenant_id" IS NULL
    `);

    // Existing admin users get the default tenant's seeded "Admin" role so
    // their effective permissions are unchanged (full access).
    await queryRunner.query(`
      UPDATE "users"
      SET "role_id" = (
        SELECT r.id FROM "roles" r
        JOIN "tenants" t ON t.id::varchar = r.tenant_id
        WHERE t.name = 'HealthPlus' AND r.name = 'Admin'
        LIMIT 1
      )
      WHERE "role" = 'admin' AND "role_id" IS NULL
    `);

    // ALTER TYPE ... ADD VALUE cannot run inside the migration's transaction
    // block, so it's executed as its own statement (same pattern proven
    // working in 1780000010000-AddBookingStatesToWhatsAppConversation.ts).
    await queryRunner.query(
      `ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'super_admin'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "tenant_id", DROP COLUMN IF EXISTS "role_id"`,
    );
    // Postgres does not support removing enum values — a rollback would
    // require recreating the type entirely. Intentionally a no-op.
  }
}
