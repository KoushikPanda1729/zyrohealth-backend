import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneNumberProvider1780000002000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voice_agent_phone_numbers" ADD COLUMN IF NOT EXISTS "provider" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "voice_agent_phone_numbers" ADD COLUMN IF NOT EXISTS "assigned_agent_id" character varying`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "voice_agent_phone_numbers" DROP COLUMN IF EXISTS "provider"`,
    );
    await queryRunner.query(
      `ALTER TABLE "voice_agent_phone_numbers" DROP COLUMN IF EXISTS "assigned_agent_id"`,
    );
  }
}
