import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInterruptionSettings1780000004000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE voice_agent_drafts
        ADD COLUMN IF NOT EXISTS allow_interruptions boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS min_interruption_duration numeric(4,2) NOT NULL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS min_interruption_words int NOT NULL DEFAULT 2
    `);
    await queryRunner.query(`
      ALTER TABLE voice_agent_versions
        ADD COLUMN IF NOT EXISTS allow_interruptions boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS min_interruption_duration numeric(4,2) NOT NULL DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS min_interruption_words int NOT NULL DEFAULT 2
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE voice_agent_drafts
        DROP COLUMN IF EXISTS allow_interruptions,
        DROP COLUMN IF EXISTS min_interruption_duration,
        DROP COLUMN IF EXISTS min_interruption_words
    `);
    await queryRunner.query(`
      ALTER TABLE voice_agent_versions
        DROP COLUMN IF EXISTS allow_interruptions,
        DROP COLUMN IF EXISTS min_interruption_duration,
        DROP COLUMN IF EXISTS min_interruption_words
    `);
  }
}
