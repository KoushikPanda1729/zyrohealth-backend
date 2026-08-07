import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineShopOwnershipType1780000022000 implements MigrationInterface {
  name = 'AddMedicineShopOwnershipType1780000022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "medicine_shops_ownership_type_enum" AS ENUM('third_party', 'in_house')`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shops" ADD COLUMN IF NOT EXISTS "ownership_type" "medicine_shops_ownership_type_enum" NOT NULL DEFAULT 'third_party'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shops" DROP COLUMN IF EXISTS "ownership_type"`,
    );
    await queryRunner.query(`DROP TYPE "medicine_shops_ownership_type_enum"`);
  }
}
