import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVoiceAgents1780000000000 implements MigrationInterface {
  name = 'AddVoiceAgents1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // canCreateAgent on users
    await queryRunner.query(
      `ALTER TABLE "users" ADD "can_create_agent" boolean NOT NULL DEFAULT false`,
    );

    // voice_agents
    await queryRunner.query(`
      CREATE TABLE "voice_agents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "doctor_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "display_name" character varying NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "external_id" character varying,
        "deployed_version_id" character varying,
        CONSTRAINT "UQ_voice_agents_name" UNIQUE ("name"),
        CONSTRAINT "PK_voice_agents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_voice_agents_doctor_id" ON "voice_agents" ("doctor_id")`,
    );

    // voice_agent_drafts
    await queryRunner.query(`
      CREATE TABLE "voice_agent_drafts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "agent_id" character varying NOT NULL,
        "prompt" text,
        "welcome_message" character varying,
        "welcome_allow_interruptions" boolean NOT NULL DEFAULT true,
        "language" character varying NOT NULL DEFAULT 'en',
        "llm_provider" character varying NOT NULL DEFAULT 'openai',
        "llm_model" character varying NOT NULL DEFAULT 'gpt-4o-mini',
        "llm_temperature" numeric(3,2) NOT NULL DEFAULT 0.7,
        "stt_provider" character varying NOT NULL DEFAULT 'deepgram',
        "stt_model" character varying NOT NULL DEFAULT 'nova-2',
        "tts_provider" character varying NOT NULL DEFAULT 'elevenlabs',
        "tts_model" character varying NOT NULL DEFAULT 'eleven_flash_v2_5',
        "tts_voice_id" character varying,
        "tts_language" character varying NOT NULL DEFAULT 'en',
        "tts_voice_settings" jsonb,
        "dynamic_variables" jsonb,
        CONSTRAINT "UQ_voice_agent_drafts_agent_id" UNIQUE ("agent_id"),
        CONSTRAINT "PK_voice_agent_drafts" PRIMARY KEY ("id")
      )
    `);

    // voice_agent_versions
    await queryRunner.query(`
      CREATE TYPE "voice_agent_version_source_enum" AS ENUM ('publish', 'rollback')
    `);
    await queryRunner.query(`
      CREATE TABLE "voice_agent_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "agent_id" character varying NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "prompt" text,
        "welcome_message" character varying,
        "welcome_allow_interruptions" boolean NOT NULL DEFAULT true,
        "language" character varying NOT NULL DEFAULT 'en',
        "llm_provider" character varying NOT NULL DEFAULT 'openai',
        "llm_model" character varying NOT NULL DEFAULT 'gpt-4o-mini',
        "llm_temperature" numeric(3,2) NOT NULL DEFAULT 0.7,
        "stt_provider" character varying NOT NULL DEFAULT 'deepgram',
        "stt_model" character varying NOT NULL DEFAULT 'nova-2',
        "tts_provider" character varying NOT NULL DEFAULT 'elevenlabs',
        "tts_model" character varying NOT NULL DEFAULT 'eleven_flash_v2_5',
        "tts_voice_id" character varying,
        "tts_language" character varying NOT NULL DEFAULT 'en',
        "tts_voice_settings" jsonb,
        "dynamic_variables" jsonb,
        "source" "voice_agent_version_source_enum" NOT NULL DEFAULT 'publish',
        "deployment_status" character varying,
        "published_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_voice_agent_versions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_voice_agent_versions_agent_id" ON "voice_agent_versions" ("agent_id")`,
    );

    // voice_agent_phone_numbers
    await queryRunner.query(`
      CREATE TABLE "voice_agent_phone_numbers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "phone_number" character varying NOT NULL,
        "label" character varying,
        "assigned_doctor_id" character varying,
        "inbound_trunk_id" character varying,
        "outbound_trunk_id" character varying,
        "inbound_dispatch_rule_id" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_voice_agent_phone_numbers_phone" UNIQUE ("phone_number"),
        CONSTRAINT "PK_voice_agent_phone_numbers" PRIMARY KEY ("id")
      )
    `);

    // voice_agent_calls
    await queryRunner.query(`
      CREATE TYPE "voice_agent_call_type_enum" AS ENUM ('inbound', 'outbound')
    `);
    await queryRunner.query(`
      CREATE TYPE "voice_agent_call_status_enum" AS ENUM ('initiated', 'active', 'completed', 'failed')
    `);
    await queryRunner.query(`
      CREATE TABLE "voice_agent_calls" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "agent_id" character varying NOT NULL,
        "doctor_id" character varying NOT NULL,
        "room_name" character varying NOT NULL,
        "call_type" "voice_agent_call_type_enum" NOT NULL,
        "from_number" character varying,
        "to_number" character varying,
        "status" "voice_agent_call_status_enum" NOT NULL DEFAULT 'initiated',
        "transcript" jsonb,
        "recording_url" character varying,
        "duration_seconds" integer,
        "booking_created" boolean NOT NULL DEFAULT false,
        "booking_id" character varying,
        CONSTRAINT "PK_voice_agent_calls" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_voice_agent_calls_agent_id" ON "voice_agent_calls" ("agent_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_voice_agent_calls_doctor_id" ON "voice_agent_calls" ("doctor_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "voice_agent_calls"`);
    await queryRunner.query(`DROP TYPE "voice_agent_call_status_enum"`);
    await queryRunner.query(`DROP TYPE "voice_agent_call_type_enum"`);
    await queryRunner.query(`DROP TABLE "voice_agent_phone_numbers"`);
    await queryRunner.query(`DROP TABLE "voice_agent_versions"`);
    await queryRunner.query(`DROP TYPE "voice_agent_version_source_enum"`);
    await queryRunner.query(`DROP TABLE "voice_agent_drafts"`);
    await queryRunner.query(`DROP TABLE "voice_agents"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "can_create_agent"`,
    );
  }
}
