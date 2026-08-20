import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformAppConfigBusinessDetails1780000058000
  implements MigrationInterface
{
  name = 'AddPlatformAppConfigBusinessDetails1780000058000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_app_config"
      ADD COLUMN "support_email" character varying,
      ADD COLUMN "legal_entity_name" character varying,
      ADD COLUMN "registered_address" text,
      ADD COLUMN "support_phone" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_app_config"
      DROP COLUMN "support_email",
      DROP COLUMN "legal_entity_name",
      DROP COLUMN "registered_address",
      DROP COLUMN "support_phone"
    `);
  }
}
