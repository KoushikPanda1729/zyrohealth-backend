import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformAppConfigSectionsAndBottomNav1780000052000
  implements MigrationInterface
{
  name = 'AddPlatformAppConfigSectionsAndBottomNav1780000052000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_app_config"
      ADD COLUMN "section_promo_banner" boolean NOT NULL DEFAULT true,
      ADD COLUMN "section_top_doctors" boolean NOT NULL DEFAULT true,
      ADD COLUMN "section_health_articles" boolean NOT NULL DEFAULT true,
      ADD COLUMN "bottom_nav_message" boolean NOT NULL DEFAULT true,
      ADD COLUMN "bottom_nav_calendar" boolean NOT NULL DEFAULT true,
      ADD COLUMN "bottom_nav_profile" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform_app_config"
      DROP COLUMN "section_promo_banner",
      DROP COLUMN "section_top_doctors",
      DROP COLUMN "section_health_articles",
      DROP COLUMN "bottom_nav_message",
      DROP COLUMN "bottom_nav_calendar",
      DROP COLUMN "bottom_nav_profile"
    `);
  }
}
