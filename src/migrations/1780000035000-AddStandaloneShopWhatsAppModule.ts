import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets a standalone (third_party) medicine shop run its OWN independent
// WhatsApp Business presence — own provider account, own flow builder, own
// customer conversations — completely separate from the existing "shop
// replies to a tenant's quote requests" relationship (which stays exactly
// as-is, on the tenant's own number). Gated behind a per-shop flag only a
// platform super admin can flip (see platform.service.ts), same spirit as
// TenantPermission gating tenant-level modules.
//
// whatsapp_flows.shop_id and whatsapp_sessions.shop_id are added as
// ADDITIONAL nullable columns on the existing tables (both already have a
// nullable tenant_id) rather than new parallel tables — a shop-owned flow/
// session still carries its parent tenant_id too (set alongside shop_id),
// so every existing tenant_id-keyed code path in the flow engine and
// provider resolver keeps working completely unchanged; shop_id is purely
// an additional ownership/scoping key layered on top.
export class AddStandaloneShopWhatsAppModule1780000035000
  implements MigrationInterface
{
  name = 'AddStandaloneShopWhatsAppModule1780000035000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shops" ADD COLUMN IF NOT EXISTS "whatsapp_module_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_shops" ADD COLUMN IF NOT EXISTS "whatsapp_module_enabled_at" TIMESTAMPTZ`,
    );

    await queryRunner.query(
      `ALTER TABLE "whatsapp_flows" ADD COLUMN IF NOT EXISTS "shop_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_whatsapp_flows_shop_id" ON "whatsapp_flows" ("shop_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "whatsapp_sessions" ADD COLUMN IF NOT EXISTS "shop_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_whatsapp_sessions_shop_id" ON "whatsapp_sessions" ("shop_id")`,
    );

    await queryRunner.query(
      `CREATE TYPE "medicine_shop_whatsapp_configs_provider_enum" AS ENUM('twilio', 'meta')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_whatsapp_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "provider" "medicine_shop_whatsapp_configs_provider_enum" NOT NULL,
        "twilio_account_sid" character varying,
        "twilio_auth_token" character varying,
        "twilio_from_number" character varying,
        "meta_phone_number_id" character varying,
        "meta_access_token" character varying,
        "meta_app_secret" character varying,
        "meta_api_version" character varying,
        CONSTRAINT "PK_medicine_shop_whatsapp_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_medicine_shop_whatsapp_configs_shop_id" UNIQUE ("shop_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_shop_whatsapp_configs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_shop_whatsapp_configs_provider_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_sessions_shop_id"`);
    await queryRunner.query(`ALTER TABLE "whatsapp_sessions" DROP COLUMN IF EXISTS "shop_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_flows_shop_id"`);
    await queryRunner.query(`ALTER TABLE "whatsapp_flows" DROP COLUMN IF EXISTS "shop_id"`);

    await queryRunner.query(`ALTER TABLE "medicine_shops" DROP COLUMN IF EXISTS "whatsapp_module_enabled_at"`);
    await queryRunner.query(`ALTER TABLE "medicine_shops" DROP COLUMN IF EXISTS "whatsapp_module_enabled"`);
  }
}
