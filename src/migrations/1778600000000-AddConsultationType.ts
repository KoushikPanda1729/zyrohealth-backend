import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConsultationType1778600000000 implements MigrationInterface {
  name = 'AddConsultationType1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_consultation_type_enum" AS ENUM('video', 'offline')`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "consultation_type" "public"."bookings_consultation_type_enum" NOT NULL DEFAULT 'video'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "consultation_type"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."bookings_consultation_type_enum"`,
    );
  }
}
