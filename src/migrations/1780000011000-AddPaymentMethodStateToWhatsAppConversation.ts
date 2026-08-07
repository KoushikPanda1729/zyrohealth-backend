import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodStateToWhatsAppConversation1780000011000 implements MigrationInterface {
  name = 'AddPaymentMethodStateToWhatsAppConversation1780000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "whatsapp_conversation_state_enum" ADD VALUE IF NOT EXISTS 'booking_payment_method'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres does not support removing enum values — a rollback would
    // require recreating the type entirely. Intentionally a no-op.
  }
}
