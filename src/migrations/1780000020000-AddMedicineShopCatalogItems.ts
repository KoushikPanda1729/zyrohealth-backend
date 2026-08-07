import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineShopCatalogItems1780000020000 implements MigrationInterface {
  name = 'AddMedicineShopCatalogItems1780000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_catalog_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "price_cents" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_medicine_shop_catalog_items" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_catalog_items_shop_id" ON "medicine_shop_catalog_items" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_catalog_items_tenant_id" ON "medicine_shop_catalog_items" ("tenant_id")`,
    );

    // No new permission catalog entries — the admin side reuses the
    // existing medicine_shops.view/.manage keys (already granted to the
    // Admin role), and the shop's own portal stays ownership-scoped via
    // requireRole('shop') + shopId, same as every other shop route.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "medicine_shop_catalog_items"`);
  }
}
