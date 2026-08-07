import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatalogItemAlertTimestamps1780000028000 implements MigrationInterface {
  name = 'AddCatalogItemAlertTimestamps1780000028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" ADD COLUMN IF NOT EXISTS "last_expiry_alert_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" ADD COLUMN IF NOT EXISTS "last_low_stock_alert_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" DROP COLUMN IF EXISTS "last_low_stock_alert_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" DROP COLUMN IF EXISTS "last_expiry_alert_at"`,
    );
  }
}
