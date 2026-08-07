import { MigrationInterface, QueryRunner } from 'typeorm';

// The medicine_shops.manage description was written before
// medicine_shops.dispatch existed, so it still claimed to cover
// dispatching prescriptions and sending receipts — capability that moved
// to .dispatch in the previous migration. Left uncorrected, the Roles &
// Permissions checklist would show a misleading description for what
// .manage actually does now.
export class FixMedicineShopsManageDescription1780000026000 implements MigrationInterface {
  name = 'FixMedicineShopsManageDescription1780000026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "permissions"
      SET "description" = 'Onboard, edit, and remove medicine shops, invite their portal logins, and toggle auto-mode'
      WHERE "key" = 'medicine_shops.manage'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "permissions"
      SET "description" = 'Onboard medicine shops, dispatch prescriptions for quotes, and send receipts to patients'
      WHERE "key" = 'medicine_shops.manage'
    `);
  }
}
