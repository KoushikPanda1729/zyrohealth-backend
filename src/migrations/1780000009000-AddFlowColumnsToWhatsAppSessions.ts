import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFlowColumnsToWhatsAppSessions1780000009000 implements MigrationInterface {
  name = 'AddFlowColumnsToWhatsAppSessions1780000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_sessions"
        ADD COLUMN IF NOT EXISTS "active_flow_id" character varying,
        ADD COLUMN IF NOT EXISTS "flow_node_id" character varying,
        ADD COLUMN IF NOT EXISTS "flow_variables" jsonb NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "whatsapp_sessions"
        DROP COLUMN IF EXISTS "active_flow_id",
        DROP COLUMN IF EXISTS "flow_node_id",
        DROP COLUMN IF EXISTS "flow_variables"
    `);
  }
}
