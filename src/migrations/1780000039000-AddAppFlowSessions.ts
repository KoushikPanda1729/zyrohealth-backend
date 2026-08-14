import { MigrationInterface, QueryRunner } from 'typeorm';

// Channel-neutral counterpart to whatsapp_sessions — tracks a patient's
// current position in a Flow Builder flow driven from the mobile app
// instead of WhatsApp. No conversation_state enum here (unlike
// whatsapp_sessions) — the app channel is purely flow-node driven, there's
// no hardcoded main-menu/booking/etc. state machine on this side.
export class AddAppFlowSessions1780000039000 implements MigrationInterface {
  name = 'AddAppFlowSessions1780000039000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app_flow_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "user_id" character varying NOT NULL,
        "tenant_id" character varying,
        "awaiting_human" boolean NOT NULL DEFAULT false,
        "messages" jsonb NOT NULL DEFAULT '[]',
        "last_message_at" TIMESTAMP,
        "active_flow_id" character varying,
        "flow_node_id" character varying,
        "flow_variables" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_app_flow_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_app_flow_sessions_user_id" ON "app_flow_sessions" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "app_flow_sessions"`);
  }
}
