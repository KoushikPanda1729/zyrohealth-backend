import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsAppFlows1780000008000 implements MigrationInterface {
  name = 'AddWhatsAppFlows1780000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "whatsapp_flows" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "is_active" boolean NOT NULL DEFAULT false,
        "definition" jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
        CONSTRAINT "PK_whatsapp_flows" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "whatsapp_flows"`);
  }
}
