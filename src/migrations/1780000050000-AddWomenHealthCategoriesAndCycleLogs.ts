import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWomenHealthCategoriesAndCycleLogs1780000050000
  implements MigrationInterface
{
  name = 'AddWomenHealthCategoriesAndCycleLogs1780000050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── women_health_categories ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "women_health_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "label" character varying NOT NULL,
        "icon" character varying NOT NULL,
        "color_start" character varying NOT NULL,
        "color_end" character varying NOT NULL,
        "description" text NOT NULL,
        "facts" text[] NOT NULL DEFAULT '{}',
        "tips" jsonb NOT NULL DEFAULT '[]',
        "is_published" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_women_health_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_women_health_categories_tenant_id" ON "women_health_categories" ("tenant_id")`,
    );

    // ── menstrual_cycle_logs ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "menstrual_cycle_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "patient_id" character varying NOT NULL,
        "cycle_length_days" integer NOT NULL DEFAULT 28,
        "period_length_days" integer NOT NULL DEFAULT 5,
        "last_period_start_date" date NOT NULL,
        CONSTRAINT "PK_menstrual_cycle_logs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_menstrual_cycle_logs_patient_id" UNIQUE ("patient_id")
      )
    `);

    // ── module permissions ──────────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('women_health.view', 'women_health', 'View women''s health categories'),
        ('women_health.manage', 'women_health', 'Publish and edit women''s health categories')`,
    );

    await queryRunner.query(`
      INSERT INTO "tenant_permissions" ("tenant_id", "permission_key", "is_active")
      SELECT t.id, p.key, true
      FROM "tenants" t, "permissions" p
      WHERE t.name = 'HealthPlus'
        AND p.key IN ('women_health.view', 'women_health.manage')
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_key")
      SELECT r.id, p.key
      FROM "roles" r, "permissions" p
      WHERE r.name = 'Admin' AND r.is_system = true
        AND r.tenant_id IN (SELECT id::varchar FROM "tenants" WHERE name = 'HealthPlus')
        AND p.key IN ('women_health.view', 'women_health.manage')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('women_health.view', 'women_health.manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "tenant_permissions" WHERE "permission_key" IN ('women_health.view', 'women_health.manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" IN ('women_health.view', 'women_health.manage')`,
    );
    await queryRunner.query(`DROP TABLE "menstrual_cycle_logs"`);
    await queryRunner.query(`DROP TABLE "women_health_categories"`);
  }
}
