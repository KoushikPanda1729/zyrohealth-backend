import { MigrationInterface, QueryRunner } from 'typeorm';

// Mirrors Tenant.whatsappFromNumber exactly: a super admin registers the
// REAL phone number a shop's WhatsApp module actually runs on, used purely
// for inbound-webhook routing (resolveShopIdForNumber). Kept separate from
// MedicineShopWhatsAppConfig's provider-specific fields (twilioFromNumber /
// metaPhoneNumberId) for the same reason the tenant version is separate —
// Meta identifies a number by an opaque phone_number_id, not the number
// itself, so the webhook's incoming display_phone_number needs its own
// super-admin-curated lookup value regardless of provider.
export class AddShopWhatsAppModuleFromNumber1780000036000
  implements MigrationInterface
{
  name = 'AddShopWhatsAppModuleFromNumber1780000036000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medicine_shops" ADD COLUMN IF NOT EXISTS "whatsapp_module_from_number" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_medicine_shops_whatsapp_module_from_number" ON "medicine_shops" ("whatsapp_module_from_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicine_shops_whatsapp_module_from_number"`);
    await queryRunner.query(`ALTER TABLE "medicine_shops" DROP COLUMN IF EXISTS "whatsapp_module_from_number"`);
  }
}
