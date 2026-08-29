import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantWhatsAppOtpTemplate1780000059000
  implements MigrationInterface
{
  name = 'AddTenantWhatsAppOtpTemplate1780000059000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_whatsapp_configs" ADD COLUMN "otp_template_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_whatsapp_configs" ADD COLUMN "otp_template_lang" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_whatsapp_configs" DROP COLUMN "otp_template_lang"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_whatsapp_configs" DROP COLUMN "otp_template_name"`,
    );
  }
}
