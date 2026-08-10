import { MigrationInterface, QueryRunner } from 'typeorm';

// Closes three gaps found while walking the prescription-quote marketplace
// end to end: (1) a MedicineOrder never recorded which shop/request/quote it
// came from, so a shop had no way to see its own orders; (2) a patient's
// "yes" was treated as a real order with no payment ever collected; (3)
// once a quote won, every other shop that quoted was left dangling at
// 'submitted' forever with no way to know they lost.
//
// medicine_order_payments mirrors the existing `payments` table (which is
// hard-wired 1:1 to a Booking via a unique booking_id) but keyed on
// order_id instead — same reason a new table was needed rather than a
// generic rename, per this codebase's established pattern of extending
// existing nullable-key columns (whatsapp_flows/sessions.shop_id) but
// adding a NEW table when the existing one has a hard unique constraint
// pointing at something else.
//
// medicine_shop_payouts is a reconciliation ledger, not a real payment
// rail — there is no Stripe Connect/Razorpay Route in this codebase (single
// platform-wide STRIPE_SECRET_KEY), so a shop being "settled" just records
// that the platform paid them back outside the app.
export class AddMedicineOrderPaymentsAndPayouts1780000037000
  implements MigrationInterface
{
  name = 'AddMedicineOrderPaymentsAndPayouts1780000037000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── medicine_orders: link back to the shop/request/quote it came from,
    // plus payment tracking ────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "medicine_orders" ADD COLUMN IF NOT EXISTS "shop_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_medicine_orders_shop_id" ON "medicine_orders" ("shop_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_orders" ADD COLUMN IF NOT EXISTS "request_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_medicine_orders_request_id" ON "medicine_orders" ("request_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_orders" ADD COLUMN IF NOT EXISTS "quote_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_medicine_orders_quote_id" ON "medicine_orders" ("quote_id")`,
    );

    await queryRunner.query(
      `CREATE TYPE "medicine_orders_payment_status_enum" AS ENUM('unpaid', 'pending', 'paid', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_orders" ADD COLUMN IF NOT EXISTS "payment_status" "medicine_orders_payment_status_enum" NOT NULL DEFAULT 'unpaid'`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_orders" ADD COLUMN IF NOT EXISTS "shop_notified_at" TIMESTAMPTZ`,
    );

    // ── medicine_shop_quotes: a shop that quoted but lost needs a status
    // distinct from 'declined' (which means the shop itself opted out) ──
    // ALTER TYPE ... ADD VALUE cannot run inside the migration's transaction
    // block, so it's executed as its own statement.
    await queryRunner.query(
      `ALTER TYPE "medicine_shop_quotes_status_enum" ADD VALUE IF NOT EXISTS 'not_selected'`,
    );

    // ── medicine_order_payments ──────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "medicine_order_payments_gateway_enum" AS ENUM('stripe', 'razorpay')`,
    );
    await queryRunner.query(
      `CREATE TYPE "medicine_order_payments_status_enum" AS ENUM('pending', 'success', 'failed', 'refunded')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_order_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying,
        "order_id" character varying NOT NULL,
        "gateway" "medicine_order_payments_gateway_enum" NOT NULL DEFAULT 'stripe',
        "status" "medicine_order_payments_status_enum" NOT NULL DEFAULT 'pending',
        "amount_cents" integer NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'inr',
        "payment_intent_id" character varying,
        "payment_method_id" character varying,
        "refund_id" character varying,
        "refund_amount_cents" integer,
        "gateway_response" jsonb,
        "paid_at" TIMESTAMPTZ,
        "refunded_at" TIMESTAMPTZ,
        CONSTRAINT "PK_medicine_order_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_medicine_order_payments_order_id" UNIQUE ("order_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_medicine_order_payments_payment_intent_id" ON "medicine_order_payments" ("payment_intent_id")`,
    );

    // ── medicine_shop_payouts ────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_payouts_status_enum" AS ENUM('owed', 'settled')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_payouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "order_id" character varying NOT NULL,
        "tenant_id" character varying,
        "amount_cents" integer NOT NULL,
        "status" "medicine_shop_payouts_status_enum" NOT NULL DEFAULT 'owed',
        "settled_at" TIMESTAMPTZ,
        "settled_by_user_id" character varying,
        "note" character varying,
        CONSTRAINT "PK_medicine_shop_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_medicine_shop_payouts_order_id" UNIQUE ("order_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_medicine_shop_payouts_shop_id" ON "medicine_shop_payouts" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_medicine_shop_payouts_status" ON "medicine_shop_payouts" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_shop_payouts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_shop_payouts_status_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_order_payments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_order_payments_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_order_payments_gateway_enum"`);

    // Postgres does not support removing a single enum value — a rollback
    // would require recreating the type entirely. Intentionally left in
    // place, same precedent as every other ADD VALUE migration here.

    await queryRunner.query(`ALTER TABLE "medicine_orders" DROP COLUMN IF EXISTS "shop_notified_at"`);
    await queryRunner.query(`ALTER TABLE "medicine_orders" DROP COLUMN IF EXISTS "payment_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_orders_payment_status_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicine_orders_quote_id"`);
    await queryRunner.query(`ALTER TABLE "medicine_orders" DROP COLUMN IF EXISTS "quote_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicine_orders_request_id"`);
    await queryRunner.query(`ALTER TABLE "medicine_orders" DROP COLUMN IF EXISTS "request_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicine_orders_shop_id"`);
    await queryRunner.query(`ALTER TABLE "medicine_orders" DROP COLUMN IF EXISTS "shop_id"`);
  }
}
