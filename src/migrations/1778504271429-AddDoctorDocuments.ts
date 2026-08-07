import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDoctorDocuments1778504271429 implements MigrationInterface {
  name = 'AddDoctorDocuments1778504271429';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_documents_document_type_enum" AS ENUM('medical_license', 'degree_certificate', 'id_proof', 'profile_photo', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "doctor_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "doctor_profile_id" uuid NOT NULL, "document_type" "public"."doctor_documents_document_type_enum" NOT NULL, "file_url" character varying NOT NULL, "file_name" character varying NOT NULL, "mime_type" character varying NOT NULL, "notes" character varying, CONSTRAINT "PK_555f3923c2c70c0f158b08ca461" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7b6d9d3d722df0a7f9a80276cf" ON "doctor_documents" ("doctor_profile_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_documents" ADD CONSTRAINT "FK_7b6d9d3d722df0a7f9a80276cf2" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "doctor_documents" DROP CONSTRAINT "FK_7b6d9d3d722df0a7f9a80276cf2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7b6d9d3d722df0a7f9a80276cf"`,
    );
    await queryRunner.query(`DROP TABLE "doctor_documents"`);
    await queryRunner.query(
      `DROP TYPE "public"."doctor_documents_document_type_enum"`,
    );
  }
}
