import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArticlesAndBookmarks1780000048000 implements MigrationInterface {
  name = 'AddArticlesAndBookmarks1780000048000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── articles ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "articles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "title" character varying NOT NULL,
        "body" text NOT NULL,
        "image_url" character varying,
        "category" character varying,
        "author_name" character varying,
        "read_time_minutes" integer NOT NULL DEFAULT 3,
        "is_published" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_articles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_articles_tenant_id" ON "articles" ("tenant_id")`);

    // ── article_bookmarks ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "article_bookmarks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "patient_id" character varying NOT NULL,
        "article_id" character varying NOT NULL,
        CONSTRAINT "PK_article_bookmarks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_article_bookmarks_patient_article" UNIQUE ("patient_id", "article_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_article_bookmarks_patient_id" ON "article_bookmarks" ("patient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_article_bookmarks_article_id" ON "article_bookmarks" ("article_id")`,
    );

    // ── module permissions ──────────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('articles.view', 'articles', 'View the health article library'),
        ('articles.manage', 'articles', 'Publish and edit health articles')`,
    );

    // Same backfill precedent as every other new module — only the
    // pre-existing 'HealthPlus' tenant gets this for free.
    await queryRunner.query(`
      INSERT INTO "tenant_permissions" ("tenant_id", "permission_key", "is_active")
      SELECT t.id, p.key, true
      FROM "tenants" t, "permissions" p
      WHERE t.name = 'HealthPlus'
        AND p.key IN ('articles.view', 'articles.manage')
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_key")
      SELECT r.id, p.key
      FROM "roles" r, "permissions" p
      WHERE r.name = 'Admin' AND r.is_system = true
        AND r.tenant_id IN (SELECT id::varchar FROM "tenants" WHERE name = 'HealthPlus')
        AND p.key IN ('articles.view', 'articles.manage')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('articles.view', 'articles.manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "tenant_permissions" WHERE "permission_key" IN ('articles.view', 'articles.manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" IN ('articles.view', 'articles.manage')`,
    );
    await queryRunner.query(`DROP TABLE "article_bookmarks"`);
    await queryRunner.query(`DROP TABLE "articles"`);
  }
}
