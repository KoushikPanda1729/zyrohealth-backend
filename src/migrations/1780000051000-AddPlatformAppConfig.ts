import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformAppConfig1780000051000 implements MigrationInterface {
  name = 'AddPlatformAppConfig1780000051000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform_app_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "top_tab_health" boolean NOT NULL DEFAULT true,
        "top_tab_ai_doctor" boolean NOT NULL DEFAULT true,
        "top_tab_women" boolean NOT NULL DEFAULT true,
        "quick_action_doctor" boolean NOT NULL DEFAULT true,
        "quick_action_pharmacy" boolean NOT NULL DEFAULT true,
        "quick_action_prescription" boolean NOT NULL DEFAULT true,
        "quick_action_hospital" boolean NOT NULL DEFAULT true,
        "quick_action_ambulance" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_platform_app_config" PRIMARY KEY ("id")
      )
    `);

    // Seed the single config row up front so `getAppConfig` always has a
    // row to read (get-or-create still guards against it being deleted).
    await queryRunner.query(`INSERT INTO "platform_app_config" DEFAULT VALUES`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "platform_app_config"`);
  }
}
