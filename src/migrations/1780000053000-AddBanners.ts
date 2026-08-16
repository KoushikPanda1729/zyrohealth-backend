import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBanners1780000053000 implements MigrationInterface {
  name = 'AddBanners1780000053000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Global — owned by the platform, same scope as platform_app_configs,
    // managed on the App Config page (not a tenant-permissioned resource).
    await queryRunner.query(`
      CREATE TABLE "banners" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "title" character varying NOT NULL,
        "image_url" character varying,
        "cta_text" character varying NOT NULL DEFAULT 'Learn more',
        "cta_link" character varying,
        "background_color" character varying NOT NULL DEFAULT '#DBEFED',
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_published" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_banners" PRIMARY KEY ("id")
      )
    `);

    // Seed a default banner matching the mobile app's previous static
    // design, so the carousel isn't empty the moment this ships.
    await queryRunner.query(`
      INSERT INTO "banners" ("title", "cta_text", "background_color", "sort_order", "is_published")
      VALUES ('Early protection\nfor your family\nhealth', 'Learn more', '#DBEFED', 0, true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "banners"`);
  }
}
