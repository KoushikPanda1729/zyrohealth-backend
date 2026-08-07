import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineShopSuppliersAndPurchaseOrders1780000029000 implements MigrationInterface {
  name = 'AddMedicineShopSuppliersAndPurchaseOrders1780000029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "phone" character varying,
        "email" character varying,
        "notes" text,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_medicine_shop_suppliers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_suppliers_shop_id" ON "medicine_shop_suppliers" ("shop_id")`,
    );

    await queryRunner.query(
      `CREATE TYPE "medicine_shop_purchase_orders_status_enum" AS ENUM('draft', 'sent', 'received', 'cancelled')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_purchase_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "supplier_id" character varying,
        "status" "medicine_shop_purchase_orders_status_enum" NOT NULL DEFAULT 'draft',
        "items" jsonb NOT NULL DEFAULT '[]',
        "note" text,
        "sent_at" TIMESTAMPTZ,
        "received_at" TIMESTAMPTZ,
        CONSTRAINT "PK_medicine_shop_purchase_orders" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_purchase_orders_shop_id" ON "medicine_shop_purchase_orders" ("shop_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "medicine_shop_catalog_item_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "catalog_item_id" character varying NOT NULL,
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "batch_number" character varying,
        "expiry_date" date,
        "quantity" integer NOT NULL DEFAULT 0,
        "last_expiry_alert_at" TIMESTAMPTZ,
        CONSTRAINT "PK_medicine_shop_catalog_item_batches" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_catalog_item_batches_catalog_item_id" ON "medicine_shop_catalog_item_batches" ("catalog_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_catalog_item_batches_shop_id" ON "medicine_shop_catalog_item_batches" ("shop_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "medicine_shop_catalog_item_batches"`);
    await queryRunner.query(`DROP TABLE "medicine_shop_purchase_orders"`);
    await queryRunner.query(`DROP TYPE "medicine_shop_purchase_orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "medicine_shop_suppliers"`);
  }
}
