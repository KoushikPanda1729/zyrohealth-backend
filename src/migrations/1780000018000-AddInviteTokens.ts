import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInviteTokens1780000018000 implements MigrationInterface {
  name = 'AddInviteTokens1780000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invite_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "user_id" character varying NOT NULL,
        "token_hash" character varying NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ,
        CONSTRAINT "UQ_invite_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "PK_invite_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_invite_tokens_user_id" ON "invite_tokens" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invite_tokens"`);
  }
}
