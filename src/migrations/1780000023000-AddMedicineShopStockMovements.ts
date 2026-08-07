import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineShopStockMovements1780000023000 implements MigrationInterface {
  name = 'AddMedicineShopStockMovements1780000023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_stock_movements_reason_enum" AS ENUM('initial', 'correction', 'restock', 'sale')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_stock_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "catalog_item_id" character varying NOT NULL,
        "item_name" character varying NOT NULL,
        "delta" integer NOT NULL,
        "quantity_after" integer NOT NULL,
        "reason" "medicine_shop_stock_movements_reason_enum" NOT NULL,
        "note" character varying,
        CONSTRAINT "PK_medicine_shop_stock_movements" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_stock_movements_shop_id" ON "medicine_shop_stock_movements" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_stock_movements_catalog_item_id" ON "medicine_shop_stock_movements" ("catalog_item_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "medicine_shop_stock_movements"`);
    await queryRunner.query(
      `DROP TYPE "medicine_shop_stock_movements_reason_enum"`,
    );
  }
}
