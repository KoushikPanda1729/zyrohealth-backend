import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineShopCatalogInventoryFields1780000021000 implements MigrationInterface {
  name = 'AddMedicineShopCatalogInventoryFields1780000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "medicine_shop_catalog_items"
        ADD COLUMN IF NOT EXISTS "quantity" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "unit" character varying NOT NULL DEFAULT 'unit',
        ADD COLUMN IF NOT EXISTS "rack_location" character varying,
        ADD COLUMN IF NOT EXISTS "batch_number" character varying,
        ADD COLUMN IF NOT EXISTS "expiry_date" date,
        ADD COLUMN IF NOT EXISTS "manufacturer" character varying,
        ADD COLUMN IF NOT EXISTS "sku" character varying,
        ADD COLUMN IF NOT EXISTS "low_stock_threshold" integer
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_medicine_shop_catalog_items_rack_location" ON "medicine_shop_catalog_items" ("rack_location")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_medicine_shop_catalog_items_rack_location"`,
    );
    await queryRunner.query(`
      ALTER TABLE "medicine_shop_catalog_items"
        DROP COLUMN IF EXISTS "low_stock_threshold",
        DROP COLUMN IF EXISTS "sku",
        DROP COLUMN IF EXISTS "manufacturer",
        DROP COLUMN IF EXISTS "expiry_date",
        DROP COLUMN IF EXISTS "batch_number",
        DROP COLUMN IF EXISTS "rack_location",
        DROP COLUMN IF EXISTS "unit",
        DROP COLUMN IF EXISTS "quantity"
    `);
  }
}
