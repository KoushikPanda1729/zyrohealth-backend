import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds Gupshup as a third WhatsApp provider option, alongside Twilio and
// Meta — same column-per-provider convention already used on both
// tenant_whatsapp_configs and medicine_shop_whatsapp_configs.
// gupshup_webhook_secret exists because Gupshup has no HMAC webhook-signing
// mechanism like Twilio/Meta do — this is a self-chosen shared secret
// embedded in the callback URL path instead (see
// whatsapp-webhook.controller.ts#receiveGupshup).
export class AddGupshupWhatsAppProvider1780000038000
  implements MigrationInterface
{
  name = 'AddGupshupWhatsAppProvider1780000038000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ALTER TYPE ... ADD VALUE cannot run inside the migration's transaction
    // block, so each is executed as its own statement (same precedent as
    // 1780000010000-AddBookingStatesToWhatsAppConversation.ts).
    await queryRunner.query(
      `ALTER TYPE "tenant_whatsapp_configs_provider_enum" ADD VALUE IF NOT EXISTS 'gupshup'`,
    );
    await queryRunner.query(
      `ALTER TYPE "medicine_shop_whatsapp_configs_provider_enum" ADD VALUE IF NOT EXISTS 'gupshup'`,
    );

    for (const table of ['tenant_whatsapp_configs', 'medicine_shop_whatsapp_configs']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "gupshup_api_key" character varying`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "gupshup_source_number" character varying`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "gupshup_app_name" character varying`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "gupshup_webhook_secret" character varying`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['tenant_whatsapp_configs', 'medicine_shop_whatsapp_configs']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "gupshup_webhook_secret"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "gupshup_app_name"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "gupshup_source_number"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "gupshup_api_key"`);
    }
    // Postgres does not support removing a single enum value — a rollback
    // would require recreating both types entirely. Intentionally left in
    // place, same precedent as every other ADD VALUE migration here.
  }
}
