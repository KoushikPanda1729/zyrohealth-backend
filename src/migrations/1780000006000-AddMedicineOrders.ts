import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicineOrders1780000006000 implements MigrationInterface {
  name = 'AddMedicineOrders1780000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "medicine_order_status_enum" AS ENUM (
        'placed', 'confirmed', 'packed', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "medicine_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "patient_id" character varying NOT NULL,
        "doctor_id" character varying,
        "prescription_id" character varying,
        "items" jsonb NOT NULL DEFAULT '[]',
        "total_cents" integer NOT NULL,
        "status" "medicine_order_status_enum" NOT NULL DEFAULT 'placed',
        "delivery_address_line1" character varying NOT NULL,
        "delivery_address_line2" character varying,
        "delivery_city" character varying NOT NULL,
        "delivery_state" character varying NOT NULL,
        "delivery_pincode" character varying NOT NULL,
        "delivery_phone" character varying NOT NULL,
        "cancel_reason" character varying,
        "cancelled_by" character varying,
        "status_history" jsonb NOT NULL DEFAULT '[]',
        "admin_notes" text,
        CONSTRAINT "PK_medicine_orders" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_orders_patient_id" ON "medicine_orders" ("patient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_orders_doctor_id" ON "medicine_orders" ("doctor_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_orders_prescription_id" ON "medicine_orders" ("prescription_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "medicine_orders"`);
    await queryRunner.query(`DROP TYPE "medicine_order_status_enum"`);
  }
}
