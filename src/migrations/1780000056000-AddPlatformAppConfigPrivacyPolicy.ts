import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformAppConfigPrivacyPolicy1780000056000
  implements MigrationInterface
{
  name = 'AddPlatformAppConfigPrivacyPolicy1780000056000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_app_config"
      ADD COLUMN "privacy_policy" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_app_config"
      DROP COLUMN "privacy_policy"
    `);
  }
}
