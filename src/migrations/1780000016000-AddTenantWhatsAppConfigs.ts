import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantWhatsAppConfigs1780000016000 implements MigrationInterface {
  name = 'AddTenantWhatsAppConfigs1780000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "tenant_whatsapp_configs_provider_enum" AS ENUM('twilio', 'meta')`,
    );
    await queryRunner.query(`
      CREATE TABLE "tenant_whatsapp_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "provider" "tenant_whatsapp_configs_provider_enum" NOT NULL,
        "twilio_account_sid" character varying,
        "twilio_auth_token" character varying,
        "twilio_from_number" character varying,
        "meta_phone_number_id" character varying,
        "meta_access_token" character varying,
        "meta_app_secret" character varying,
        "meta_api_version" character varying,
        CONSTRAINT "UQ_tenant_whatsapp_configs_tenant_id" UNIQUE ("tenant_id"),
        CONSTRAINT "PK_tenant_whatsapp_configs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_whatsapp_configs_tenant_id" ON "tenant_whatsapp_configs" ("tenant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "tenant_whatsapp_configs"`);
    await queryRunner.query(
      `DROP TYPE "tenant_whatsapp_configs_provider_enum"`,
    );
  }
}
