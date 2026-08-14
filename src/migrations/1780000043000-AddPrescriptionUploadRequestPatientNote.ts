import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrescriptionUploadRequestPatientNote1780000043000 implements MigrationInterface {
  name = 'AddPrescriptionUploadRequestPatientNote1780000043000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "prescription_upload_requests" ADD COLUMN "patient_note" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "prescription_upload_requests" DROP COLUMN "patient_note"`);
  }
}
