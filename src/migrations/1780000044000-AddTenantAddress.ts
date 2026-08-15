import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantAddress1780000044000 implements MigrationInterface {
  name = 'AddTenantAddress1780000044000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "address" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "address"`);
  }
}
