import { MigrationInterface, QueryRunner } from 'typeorm';

// A lighter platform-level tier that can view every tenant/medicine shop
// (for support/troubleshooting) but not create, edit, deactivate,
// impersonate, or invite anything — see platform.routes.ts's read/write
// split. ALTER TYPE ... ADD VALUE cannot run inside the migration's
// transaction block, so it's its own statement (same pattern proven
// working in 1780000013000-AddTenantAndRoleToUsers.ts).
export class AddPlatformSupportRole1780000027000 implements MigrationInterface {
  name = 'AddPlatformSupportRole1780000027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'platform_support'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres can't drop a single enum value without recreating the
    // type — not worth the churn for a rollback path; leaving the value
    // defined is harmless if unused.
  }
}
