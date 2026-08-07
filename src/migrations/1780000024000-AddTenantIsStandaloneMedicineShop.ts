import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIsStandaloneMedicineShop1780000024000 implements MigrationInterface {
  name = 'AddTenantIsStandaloneMedicineShop1780000024000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "is_standalone_medicine_shop" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "is_standalone_medicine_shop"`,
    );
  }
}
