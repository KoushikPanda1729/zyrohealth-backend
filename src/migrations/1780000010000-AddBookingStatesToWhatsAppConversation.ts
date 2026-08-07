import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingStatesToWhatsAppConversation1780000010000 implements MigrationInterface {
  name = 'AddBookingStatesToWhatsAppConversation1780000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ALTER TYPE ... ADD VALUE cannot run inside the migration's transaction block,
    // so each one is executed as its own statement.
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'booking_specialty'`,
    );
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'booking_doctor'`,
    );
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'booking_slot'`,
    );
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'booking_type'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres does not support removing enum values — a rollback would require
    // recreating the type entirely. Intentionally a no-op; the extra enum
    // values are harmless if left in place.
  }
}
