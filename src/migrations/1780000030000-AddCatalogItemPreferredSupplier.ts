import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatalogItemPreferredSupplier1780000030000 implements MigrationInterface {
  name = 'AddCatalogItemPreferredSupplier1780000030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" ADD COLUMN IF NOT EXISTS "preferred_supplier_id" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" DROP COLUMN IF EXISTS "preferred_supplier_id"`,
    );
  }
}
