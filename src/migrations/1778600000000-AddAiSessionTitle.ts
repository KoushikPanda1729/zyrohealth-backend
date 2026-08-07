import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiSessionTitle1778600000000 implements MigrationInterface {
  name = 'AddAiSessionTitle1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ADD "title" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_sessions" DROP COLUMN "title"`);
  }
}
