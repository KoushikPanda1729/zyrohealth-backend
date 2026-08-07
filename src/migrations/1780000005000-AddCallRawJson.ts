import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCallRawJson1780000005000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE voice_agent_calls
        ADD COLUMN IF NOT EXISTS raw_json jsonb;
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `ALTER TABLE voice_agent_calls DROP COLUMN IF EXISTS raw_json`,
    );
  }
}
