import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiDoctors1778504978525 implements MigrationInterface {
  name = 'AddAiDoctors1778504978525';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ai_doctors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "specialty" character varying, "description" text, "avatar_url" character varying, "system_prompt" text NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_by" uuid NOT NULL, CONSTRAINT "PK_369b44442f08884206eacbf834a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ADD "ai_doctor_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_doctors" ADD CONSTRAINT "FK_fc2adcb4b64c2b64c2d9c4495cd" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ADD CONSTRAINT "FK_4857013412ab0a9f6a815d6dc57" FOREIGN KEY ("ai_doctor_id") REFERENCES "ai_doctors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" DROP CONSTRAINT "FK_4857013412ab0a9f6a815d6dc57"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_doctors" DROP CONSTRAINT "FK_fc2adcb4b64c2b64c2d9c4495cd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" DROP COLUMN "ai_doctor_id"`,
    );
    await queryRunner.query(`DROP TABLE "ai_doctors"`);
  }
}
