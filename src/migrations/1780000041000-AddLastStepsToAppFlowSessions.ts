import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastStepsToAppFlowSessions1780000041000 implements MigrationInterface {
  name = 'AddLastStepsToAppFlowSessions1780000041000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "app_flow_sessions" ADD COLUMN "last_steps" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app_flow_sessions" DROP COLUMN "last_steps"`);
  }
}
