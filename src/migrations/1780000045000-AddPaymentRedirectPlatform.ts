import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentRedirectPlatform1780000045000 implements MigrationInterface {
  name = 'AddPaymentRedirectPlatform1780000045000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" ADD COLUMN "redirect_platform" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_order_payments" ADD COLUMN "redirect_platform" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "medicine_order_payments" DROP COLUMN "redirect_platform"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "redirect_platform"`);
  }
}
