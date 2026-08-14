import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineOrderPaymentMethod1780000042000 implements MigrationInterface {
  name = 'AddMedicineOrderPaymentMethod1780000042000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "medicine_orders_payment_method_enum" AS ENUM('online', 'cod')`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_orders" ADD COLUMN "payment_method" "medicine_orders_payment_method_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "medicine_orders" DROP COLUMN "payment_method"`);
    await queryRunner.query(`DROP TYPE "medicine_orders_payment_method_enum"`);
  }
}
