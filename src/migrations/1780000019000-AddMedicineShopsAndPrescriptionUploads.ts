import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineShopsAndPrescriptionUploads1780000019000 implements MigrationInterface {
  name = 'AddMedicineShopsAndPrescriptionUploads1780000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── medicine_shops ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "medicine_shops" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "contact_phone" character varying NOT NULL,
        "contact_email" character varying,
        "address_line1" character varying,
        "city" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "whatsapp_linked" boolean NOT NULL DEFAULT false,
        "whatsapp_linked_at" TIMESTAMPTZ,
        CONSTRAINT "PK_medicine_shops" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shops_tenant_id" ON "medicine_shops" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shops_contact_phone" ON "medicine_shops" ("contact_phone")`,
    );

    // ── prescription_upload_requests ────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "prescription_upload_requests_status_enum" AS ENUM(
        'pending_dispatch', 'dispatched', 'quoted', 'sent_to_patient', 'confirmed', 'cancelled', 'expired'
      )`,
    );
    await queryRunner.query(`
      CREATE TABLE "prescription_upload_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "patient_id" character varying NOT NULL,
        "whatsapp_session_id" character varying,
        "image_url" character varying NOT NULL,
        "status" "prescription_upload_requests_status_enum" NOT NULL DEFAULT 'pending_dispatch',
        "dispatched_shop_ids" jsonb NOT NULL DEFAULT '[]',
        "assigned_to_user_id" character varying,
        "chosen_quote_id" character varying,
        "resulting_order_id" character varying,
        CONSTRAINT "PK_prescription_upload_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_prescription_upload_requests_tenant_id" ON "prescription_upload_requests" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_prescription_upload_requests_patient_id" ON "prescription_upload_requests" ("patient_id")`,
    );

    // ── medicine_shop_quotes ─────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_quotes_status_enum" AS ENUM('pending', 'submitted', 'declined')`,
    );
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_quotes_submitted_via_enum" AS ENUM('portal', 'whatsapp', 'manual')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_quotes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "request_id" character varying NOT NULL,
        "shop_id" character varying NOT NULL,
        "status" "medicine_shop_quotes_status_enum" NOT NULL DEFAULT 'pending',
        "items" jsonb,
        "total_cents" integer,
        "note" character varying,
        "submitted_via" "medicine_shop_quotes_submitted_via_enum",
        "submitted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_medicine_shop_quotes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_quotes_request_id" ON "medicine_shop_quotes" ("request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_quotes_shop_id" ON "medicine_shop_quotes" ("shop_id")`,
    );

    // ── users: shop_id + role enum ───────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "shop_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_shop_id" ON "users" ("shop_id")`,
    );
    // ALTER TYPE ... ADD VALUE cannot run inside the migration's transaction
    // block, so it's executed as its own statement (same pattern proven
    // working in 1780000013000-AddTenantAndRoleToUsers.ts).
    await queryRunner.query(
      `ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'shop'`,
    );

    // ── tenants: auto-mode toggle ────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "medicine_order_auto_mode" boolean NOT NULL DEFAULT false`,
    );

    // ── whatsapp_sessions: new conversation states ──────────────────────
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'awaiting_prescription_upload'`,
    );
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'awaiting_shop_quote'`,
    );
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'awaiting_order_confirmation'`,
    );

    // ── permission catalog: new keys ─────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('medicine_shops.view', 'medicine_shops', 'View onboarded medicine shops and prescription upload requests'),
        ('medicine_shops.manage', 'medicine_shops', 'Onboard medicine shops, dispatch prescriptions for quotes, and send receipts to patients')`,
    );

    // Backfill the same way the original tenancy migration did: only the
    // pre-existing 'HealthPlus' tenant (the one that existed before
    // multi-tenancy) gets this new module for free, so its current admin
    // isn't blocked from a brand new module they had no way to opt into.
    // Every other tenant follows the normal path — a super admin enables it
    // via tenant entitlements like any other module.
    await queryRunner.query(`
      INSERT INTO "tenant_permissions" ("tenant_id", "permission_key", "is_active")
      SELECT t.id, p.key, true
      FROM "tenants" t, "permissions" p
      WHERE t.name = 'HealthPlus' AND p.key IN ('medicine_shops.view', 'medicine_shops.manage')
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_key")
      SELECT r.id, p.key
      FROM "roles" r, "permissions" p
      WHERE r.name = 'Admin' AND r.is_system = true
        AND r.tenant_id IN (SELECT id::varchar FROM "tenants" WHERE name = 'HealthPlus')
        AND p.key IN ('medicine_shops.view', 'medicine_shops.manage')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('medicine_shops.view', 'medicine_shops.manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "tenant_permissions" WHERE "permission_key" IN ('medicine_shops.view', 'medicine_shops.manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" IN ('medicine_shops.view', 'medicine_shops.manage')`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN IF EXISTS "medicine_order_auto_mode"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_shop_id"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "shop_id"`,
    );
    await queryRunner.query(`DROP TABLE "medicine_shop_quotes"`);
    await queryRunner.query(
      `DROP TYPE "medicine_shop_quotes_submitted_via_enum"`,
    );
    await queryRunner.query(`DROP TYPE "medicine_shop_quotes_status_enum"`);
    await queryRunner.query(`DROP TABLE "prescription_upload_requests"`);
    await queryRunner.query(
      `DROP TYPE "prescription_upload_requests_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "medicine_shops"`);
  }
}
