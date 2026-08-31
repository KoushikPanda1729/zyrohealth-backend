import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderMedicineSearchStates1780000061000 implements MigrationInterface {
  name = 'AddOrderMedicineSearchStates1780000061000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'order_medicine_choice'`,
    );
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'awaiting_medicine_search'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres can't drop a single enum value without recreating the type
    // — no-op, same precedent as other ADD VALUE migrations in this codebase.
  }
}
