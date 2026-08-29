import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantWhatsAppGupshupAppId1780000060000
  implements MigrationInterface
{
  name = 'AddTenantWhatsAppGupshupAppId1780000060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_whatsapp_configs" ADD COLUMN "gupshup_app_id" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_whatsapp_configs" DROP COLUMN "gupshup_app_id"`,
    );
  }
}
