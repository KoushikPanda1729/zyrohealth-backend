import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingTokenNumber1780000054000 implements MigrationInterface {
  name = 'AddBookingTokenNumber1780000054000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD COLUMN "token_number" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "token_number"`);
  }
}
