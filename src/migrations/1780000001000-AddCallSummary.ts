import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCallSummary1780000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voice_agent_calls" ADD COLUMN IF NOT EXISTS "summary" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voice_agent_calls" DROP COLUMN IF EXISTS "summary"`,
    );
  }
}
