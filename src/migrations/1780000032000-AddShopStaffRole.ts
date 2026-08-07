import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShopStaffRole1780000032000 implements MigrationInterface {
  name = 'AddShopStaffRole1780000032000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "users_shop_staff_role_enum" AS ENUM('owner', 'cashier')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "shop_staff_role" "users_shop_staff_role_enum"`,
    );
    // Every existing shop login predates this feature and was the shop's
    // only login — treat it as the owner so nothing that already works
    // today suddenly loses access.
    await queryRunner.query(
      `UPDATE "users" SET "shop_staff_role" = 'owner' WHERE "role" = 'shop' AND "shop_staff_role" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "shop_staff_role"`);
    await queryRunner.query(`DROP TYPE "users_shop_staff_role_enum"`);
  }
}
