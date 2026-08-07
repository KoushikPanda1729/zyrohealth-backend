import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingCreditReturnsCompliance1780000031000 implements MigrationInterface {
  name = 'AddBillingCreditReturnsCompliance1780000031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Catalog item additions: GST rate, controlled-drug flag, pack-size ──
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" ADD COLUMN IF NOT EXISTS "gst_rate_percent" integer NOT NULL DEFAULT 12`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" ADD COLUMN IF NOT EXISTS "is_controlled_drug" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" ADD COLUMN IF NOT EXISTS "pack_size" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" ADD COLUMN IF NOT EXISTS "sub_unit" character varying`,
    );

    // ── Stock movement reasons: return, damage ─────────────────────────
    await queryRunner.query(
      `ALTER TYPE "medicine_shop_stock_movements_reason_enum" ADD VALUE IF NOT EXISTS 'return'`,
    );
    await queryRunner.query(
      `ALTER TYPE "medicine_shop_stock_movements_reason_enum" ADD VALUE IF NOT EXISTS 'damage'`,
    );

    // ── Customers + credit ledger ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "phone" character varying,
        "address" character varying,
        "outstanding_due_cents" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_medicine_shop_customers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_customers_shop_id" ON "medicine_shop_customers" ("shop_id")`,
    );

    await queryRunner.query(
      `CREATE TYPE "medicine_shop_customer_ledger_entries_type_enum" AS ENUM('sale', 'payment')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_customer_ledger_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "customer_id" character varying NOT NULL,
        "type" "medicine_shop_customer_ledger_entries_type_enum" NOT NULL,
        "amount_cents" integer NOT NULL,
        "balance_after_cents" integer NOT NULL,
        "sale_id" character varying,
        "note" character varying,
        CONSTRAINT "PK_medicine_shop_customer_ledger_entries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_customer_ledger_entries_shop_id" ON "medicine_shop_customer_ledger_entries" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_customer_ledger_entries_customer_id" ON "medicine_shop_customer_ledger_entries" ("customer_id")`,
    );

    // ── Sales (billing/POS) ──────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_sales_payment_mode_enum" AS ENUM('cash', 'upi', 'card', 'credit')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_sales" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "invoice_number" integer NOT NULL,
        "customer_id" character varying,
        "customer_name_snapshot" character varying,
        "items" jsonb NOT NULL,
        "subtotal_cents" integer NOT NULL,
        "gst_cents" integer NOT NULL,
        "total_cents" integer NOT NULL,
        "payment_mode" "medicine_shop_sales_payment_mode_enum" NOT NULL,
        "amount_paid_cents" integer NOT NULL,
        "controlled_drug_info" jsonb,
        "note" character varying,
        CONSTRAINT "PK_medicine_shop_sales" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_sales_shop_id" ON "medicine_shop_sales" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_sales_customer_id" ON "medicine_shop_sales" ("customer_id")`,
    );

    // ── Supplier prices (buying-side comparison) ────────────────────────
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_supplier_prices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "tenant_id" character varying NOT NULL,
        "supplier_id" character varying NOT NULL,
        "catalog_item_id" character varying NOT NULL,
        "price_cents" integer NOT NULL,
        CONSTRAINT "PK_medicine_shop_supplier_prices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_medicine_shop_supplier_prices_supplier_item" UNIQUE ("supplier_id", "catalog_item_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_supplier_prices_shop_id" ON "medicine_shop_supplier_prices" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_supplier_prices_catalog_item_id" ON "medicine_shop_supplier_prices" ("catalog_item_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "medicine_shop_supplier_prices"`);
    await queryRunner.query(`DROP TABLE "medicine_shop_sales"`);
    await queryRunner.query(`DROP TYPE "medicine_shop_sales_payment_mode_enum"`);
    await queryRunner.query(`DROP TABLE "medicine_shop_customer_ledger_entries"`);
    await queryRunner.query(`DROP TYPE "medicine_shop_customer_ledger_entries_type_enum"`);
    await queryRunner.query(`DROP TABLE "medicine_shop_customers"`);
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" DROP COLUMN IF EXISTS "sub_unit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" DROP COLUMN IF EXISTS "pack_size"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" DROP COLUMN IF EXISTS "is_controlled_drug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shop_catalog_items" DROP COLUMN IF EXISTS "gst_rate_percent"`,
    );
    // Postgres can't drop enum values without recreating the type — no-op
    // for the 'return'/'damage' additions, same precedent as other
    // ADD VALUE migrations in this codebase.
  }
}
