import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartments1780000015000 implements MigrationInterface {
  name = 'AddDepartments1780000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "departments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        CONSTRAINT "PK_departments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_departments_tenant_id" ON "departments" ("tenant_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_department_id" ON "users" ("department_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "department_id"`,
    );
    await queryRunner.query(`DROP TABLE "departments"`);
  }
}
