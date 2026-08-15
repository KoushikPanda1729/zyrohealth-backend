import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDoctorFavorites1780000049000 implements MigrationInterface {
  name = 'AddDoctorFavorites1780000049000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "doctor_favorites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "patient_id" character varying NOT NULL,
        "doctor_profile_id" character varying NOT NULL,
        CONSTRAINT "PK_doctor_favorites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_doctor_favorites_patient_doctor" UNIQUE ("patient_id", "doctor_profile_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_doctor_favorites_patient_id" ON "doctor_favorites" ("patient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_doctor_favorites_doctor_profile_id" ON "doctor_favorites" ("doctor_profile_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "doctor_favorites"`);
  }
}
