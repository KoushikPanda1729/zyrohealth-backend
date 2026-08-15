import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHospitalAndAmbulanceCoordinates1780000047000 implements MigrationInterface {
  name = 'AddHospitalAndAmbulanceCoordinates1780000047000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "hospitals"
      ADD COLUMN "latitude" double precision,
      ADD COLUMN "longitude" double precision
    `);
    await queryRunner.query(`
      ALTER TABLE "ambulance_requests"
      ADD COLUMN "pickup_latitude" double precision,
      ADD COLUMN "pickup_longitude" double precision
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ambulance_requests"
      DROP COLUMN "pickup_latitude",
      DROP COLUMN "pickup_longitude"
    `);
    await queryRunner.query(`
      ALTER TABLE "hospitals"
      DROP COLUMN "latitude",
      DROP COLUMN "longitude"
    `);
  }
}
