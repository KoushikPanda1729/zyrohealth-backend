import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenActingShopId1780000055000
  implements MigrationInterface
{
  name = 'AddRefreshTokenActingShopId1780000055000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN "acting_shop_id" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "acting_shop_id"`,
    );
  }
}
