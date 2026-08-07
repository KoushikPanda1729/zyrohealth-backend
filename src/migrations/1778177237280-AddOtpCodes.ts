import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpCodes1778177237280 implements MigrationInterface {
  name = 'AddOtpCodes1778177237280';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "otp_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phone_number" character varying NOT NULL, "code" character varying(6) NOT NULL, "expires_at" TIMESTAMP NOT NULL, "verified" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9d0487965ac1837d57fec4d6a26" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "otp_codes"`);
  }
}
