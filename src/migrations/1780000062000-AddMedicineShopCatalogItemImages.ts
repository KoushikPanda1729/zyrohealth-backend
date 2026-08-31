import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineShopCatalogItemImages1780000062000 implements MigrationInterface {
  name = 'AddMedicineShopCatalogItemImages1780000062000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" ADD COLUMN "image_urls" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" DROP COLUMN "image_urls"`,
    );
  }
}
