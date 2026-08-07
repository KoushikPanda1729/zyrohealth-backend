import { MigrationInterface, QueryRunner } from 'typeorm';

// Splits medicine_shops.manage into two tiers:
//   - medicine_shops.manage   — administering the shop roster itself:
//     onboarding/editing/removing shops, inviting shop logins, opening a
//     shop's full portal view, and toggling auto-mode. Sensitive/rare.
//   - medicine_shops.dispatch — day-to-day operational work: dispatching
//     prescriptions to shops, recording/selecting quotes, and managing a
//     shop's catalog on its behalf. Safe to hand to a junior staff member
//     (e.g. a "Pharmacy Coordinator" role) without also giving them the
//     ability to onboard/remove shops or create new shop logins.
// Everyone who already had medicine_shops.manage keeps full capability —
// this backfills medicine_shops.dispatch everywhere .manage was already
// granted, at both the tenant-entitlement and role level, so no existing
// tenant admin or custom role loses access to anything.
export class AddMedicineShopsDispatchPermission1780000025000 implements MigrationInterface {
  name = 'AddMedicineShopsDispatchPermission1780000025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('medicine_shops.dispatch', 'medicine_shops', 'Dispatch prescriptions to shops for quotes, record/select quotes, and manage a shop''s catalog on its behalf')`,
    );

    await queryRunner.query(`
      INSERT INTO "tenant_permissions" ("tenant_id", "permission_key", "is_active")
      SELECT tp.tenant_id, 'medicine_shops.dispatch', tp.is_active
      FROM "tenant_permissions" tp
      WHERE tp.permission_key = 'medicine_shops.manage'
        AND NOT EXISTS (
          SELECT 1 FROM "tenant_permissions" tp2
          WHERE tp2.tenant_id = tp.tenant_id AND tp2.permission_key = 'medicine_shops.dispatch'
        )
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_key")
      SELECT rp.role_id, 'medicine_shops.dispatch'
      FROM "role_permissions" rp
      WHERE rp.permission_key = 'medicine_shops.manage'
        AND NOT EXISTS (
          SELECT 1 FROM "role_permissions" rp2
          WHERE rp2.role_id = rp.role_id AND rp2.permission_key = 'medicine_shops.dispatch'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" = 'medicine_shops.dispatch'`,
    );
    await queryRunner.query(
      `DELETE FROM "tenant_permissions" WHERE "permission_key" = 'medicine_shops.dispatch'`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" = 'medicine_shops.dispatch'`,
    );
  }
}
