import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsAppSessions1780000007000 implements MigrationInterface {
  name = 'AddWhatsAppSessions1780000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "whatsapp_conversation_state_enum" AS ENUM (
        'main_menu', 'awaiting_ai', 'closed'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "whatsapp_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "phone_number" character varying NOT NULL,
        "user_id" character varying,
        "conversation_state" "whatsapp_conversation_state_enum" NOT NULL DEFAULT 'main_menu',
        "awaiting_human" boolean NOT NULL DEFAULT false,
        "messages" jsonb NOT NULL DEFAULT '[]',
        "last_message_at" TIMESTAMP,
        CONSTRAINT "PK_whatsapp_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_sessions_phone_number" ON "whatsapp_sessions" ("phone_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_whatsapp_sessions_user_id" ON "whatsapp_sessions" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "whatsapp_sessions"`);
    await queryRunner.query(`DROP TYPE "whatsapp_conversation_state_enum"`);
  }
}
