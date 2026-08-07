import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1778174391337 implements MigrationInterface {
  name = 'InitialSchema1778174391337';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "patient_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "date_of_birth" date, "gender" character varying, "blood_group" character varying, "allergies" text array NOT NULL DEFAULT '{}', "chronic_conditions" text array NOT NULL DEFAULT '{}', "profile_picture_url" character varying, "address" character varying, "city" character varying, "state" character varying, "country" character varying, "emergency_contact_name" character varying, "emergency_contact_phone" character varying, CONSTRAINT "REL_e296010b9088277148d109ba75" UNIQUE ("user_id"), CONSTRAINT "PK_7297a6976f065cc75e798674aa8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e296010b9088277148d109ba75" ON "patient_profiles" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_availability_day_of_week_enum" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')`,
    );
    await queryRunner.query(
      `CREATE TABLE "doctor_availability" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "doctor_profile_id" uuid NOT NULL, "day_of_week" "public"."doctor_availability_day_of_week_enum" NOT NULL, "start_time" character varying NOT NULL, "end_time" character varying NOT NULL, "slot_duration_minutes" integer NOT NULL DEFAULT '30', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_3d2b4ffe9085f8c7f9f269aed89" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6032c61b58b8a647e13a4b20c5" ON "doctor_availability" ("doctor_profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "medicine_catalogue" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "doctor_profile_id" uuid NOT NULL, "name" character varying NOT NULL, "genericName" character varying, "category" character varying, "defaultDosage" character varying, "defaultFrequency" character varying, "defaultDuration" character varying, "defaultRoute" character varying, "notes" character varying, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_85e4386b641ae033bfca686c97c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9529b317c0649cffda924e08d0" ON "medicine_catalogue" ("doctor_profile_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "test_catalogue" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "doctor_profile_id" uuid NOT NULL, "name" character varying NOT NULL, "category" character varying, "description" character varying, "defaultInstructions" character varying, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_f63f2bc5b4b477aa7b76804a905" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1d3079bc725e24c2e27ce14141" ON "test_catalogue" ("doctor_profile_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."doctor_profiles_approval_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "doctor_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "specialty" character varying, "license_number" character varying, "years_of_experience" integer, "languages" text array NOT NULL DEFAULT '{}', "approval_status" "public"."doctor_profiles_approval_status_enum" NOT NULL DEFAULT 'pending', "is_available" boolean NOT NULL DEFAULT false, "consultation_fee" numeric(10,2), "rating" numeric(3,2) DEFAULT '0', "total_reviews" integer NOT NULL DEFAULT '0', "total_consultations" integer NOT NULL DEFAULT '0', "bio" character varying, "profile_picture_url" character varying, "rejection_reason" character varying, "qualifications" text array NOT NULL DEFAULT '{}', CONSTRAINT "REL_69995f9059305ab7a9c52cdb10" UNIQUE ("user_id"), CONSTRAINT "PK_b07c128005f6a0d0135d6e7353b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_69995f9059305ab7a9c52cdb10" ON "doctor_profiles" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('patient', 'doctor', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "firebase_uid" character varying NOT NULL, "phone_number" character varying, "email" character varying, "full_name" character varying, "role" "public"."users_role_enum" NOT NULL DEFAULT 'patient', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_0fd54ced5cc75f7cb92925dd803" UNIQUE ("firebase_uid"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0fd54ced5cc75f7cb92925dd80" ON "users" ("firebase_uid") `,
    );
    await queryRunner.query(
      `CREATE TABLE "prescriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "booking_id" uuid NOT NULL, "doctor_id" character varying NOT NULL, "patient_id" character varying NOT NULL, "diagnosis" character varying, "notes" text, "medicines" jsonb NOT NULL DEFAULT '[]', "tests" jsonb NOT NULL DEFAULT '[]', "pdf_url" character varying, "is_sent" boolean NOT NULL DEFAULT false, "confirmed_allergy_override" boolean NOT NULL DEFAULT false, CONSTRAINT "REL_fa3ddba7c8c2952d18bb1bf9a8" UNIQUE ("booking_id"), CONSTRAINT "PK_097b2cc2f2b7e56825468188503" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fa3ddba7c8c2952d18bb1bf9a8" ON "prescriptions" ("booking_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2d6a1941bd705056030c2b9e07" ON "prescriptions" ("doctor_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9389db557647131856661f7d7b" ON "prescriptions" ("patient_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_gateway_enum" AS ENUM('stripe', 'razorpay')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'success', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "booking_id" uuid NOT NULL, "gateway" "public"."payments_gateway_enum" NOT NULL DEFAULT 'stripe', "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "amount_cents" integer NOT NULL, "currency" character varying NOT NULL DEFAULT 'usd', "payment_intent_id" character varying, "payment_method_id" character varying, "refund_id" character varying, "refund_amount_cents" integer, "gateway_response" jsonb, "paid_at" TIMESTAMP WITH TIME ZONE, "refunded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "REL_e86edf76dc2424f123b9023a2b" UNIQUE ("booking_id"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e86edf76dc2424f123b9023a2b" ON "payments" ("booking_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bd2a15bde4058590f0caea36b" ON "payments" ("payment_intent_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "booking_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "doctor_id" uuid NOT NULL, "rating" integer NOT NULL, "comment" text, CONSTRAINT "REL_bbd6ac6e3e6a8f8c6e0e8692d6" UNIQUE ("booking_id"), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bbd6ac6e3e6a8f8c6e0e8692d6" ON "reviews" ("booking_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_402264ba8208a27caf6e6940b3" ON "reviews" ("patient_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eefa239f3536811d445eae9250" ON "reviews" ("doctor_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('pending', 'paid', 'active', 'completed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "patient_id" uuid NOT NULL, "doctor_id" uuid NOT NULL, "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'pending', "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL, "duration_minutes" integer NOT NULL DEFAULT '30', "video_room_id" character varying NOT NULL, "consultation_fee_cents" integer NOT NULL, "ai_session_id" character varying, "ai_summary" text, "cancel_reason" character varying, "cancelled_by" character varying, "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_f4489f8f9afdff3ae561137a29b" UNIQUE ("video_room_id"), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_94824eac901cfb902526e59f81" ON "bookings" ("patient_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e4450c9f7a8b4bd055311d46fd" ON "bookings" ("doctor_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."chat_messages_type_enum" AS ENUM('text', 'prescription', 'image', 'file')`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "booking_id" uuid NOT NULL, "sender_id" uuid NOT NULL, "type" "public"."chat_messages_type_enum" NOT NULL DEFAULT 'text', "content" text NOT NULL, "file_url" character varying, "is_read" boolean NOT NULL DEFAULT false, "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_81eba089f810c972e8c4dee15b" ON "chat_messages" ("booking_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9e5fc47ecb06d4d7b84633b171" ON "chat_messages" ("sender_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ai_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "messages" jsonb NOT NULL DEFAULT '[]', "detected_symptoms" text array NOT NULL DEFAULT '{}', "severity_score" integer, "suggested_specialty" character varying, "refer_to_doctor" boolean NOT NULL DEFAULT false, "is_closed" boolean NOT NULL DEFAULT false, "ai_summary" text, "closed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_4a05e88d377dad1c58c3cb95c04" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c305f725faf61200f668e28f77" ON "ai_sessions" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."patient_history_entry_type_enum" AS ENUM('ai_chat', 'consult', 'prescription')`,
    );
    await queryRunner.query(
      `CREATE TABLE "patient_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "entry_type" "public"."patient_history_entry_type_enum" NOT NULL, "summary" text NOT NULL, "reference_id" character varying, "detected_symptoms" text array NOT NULL DEFAULT '{}', "severity_score" integer, "doctor_name" character varying, "specialty" character varying, "metadata" jsonb, CONSTRAINT "PK_102c4da56a8d76d03bbe1287d0e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e72c18540ae64e7887ea42f9a" ON "patient_history" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "patient_profiles" ADD CONSTRAINT "FK_e296010b9088277148d109ba75a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_availability" ADD CONSTRAINT "FK_6032c61b58b8a647e13a4b20c52" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_catalogue" ADD CONSTRAINT "FK_9529b317c0649cffda924e08d0b" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "test_catalogue" ADD CONSTRAINT "FK_1d3079bc725e24c2e27ce14141a" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_profiles" ADD CONSTRAINT "FK_69995f9059305ab7a9c52cdb10e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" ADD CONSTRAINT "FK_fa3ddba7c8c2952d18bb1bf9a89" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_e86edf76dc2424f123b9023a2b2" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_bbd6ac6e3e6a8f8c6e0e8692d63" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_402264ba8208a27caf6e6940b34" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_eefa239f3536811d445eae9250b" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_94824eac901cfb902526e59f814" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_e4450c9f7a8b4bd055311d46fd3" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_81eba089f810c972e8c4dee15b8" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_9e5fc47ecb06d4d7b84633b1718" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" ADD CONSTRAINT "FK_c305f725faf61200f668e28f77d" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "patient_history" ADD CONSTRAINT "FK_5e72c18540ae64e7887ea42f9a3" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "patient_history" DROP CONSTRAINT "FK_5e72c18540ae64e7887ea42f9a3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_sessions" DROP CONSTRAINT "FK_c305f725faf61200f668e28f77d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_9e5fc47ecb06d4d7b84633b1718"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_81eba089f810c972e8c4dee15b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_e4450c9f7a8b4bd055311d46fd3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_94824eac901cfb902526e59f814"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_eefa239f3536811d445eae9250b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_402264ba8208a27caf6e6940b34"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_bbd6ac6e3e6a8f8c6e0e8692d63"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_e86edf76dc2424f123b9023a2b2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" DROP CONSTRAINT "FK_fa3ddba7c8c2952d18bb1bf9a89"`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_profiles" DROP CONSTRAINT "FK_69995f9059305ab7a9c52cdb10e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "test_catalogue" DROP CONSTRAINT "FK_1d3079bc725e24c2e27ce14141a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicine_catalogue" DROP CONSTRAINT "FK_9529b317c0649cffda924e08d0b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_availability" DROP CONSTRAINT "FK_6032c61b58b8a647e13a4b20c52"`,
    );
    await queryRunner.query(
      `ALTER TABLE "patient_profiles" DROP CONSTRAINT "FK_e296010b9088277148d109ba75a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5e72c18540ae64e7887ea42f9a"`,
    );
    await queryRunner.query(`DROP TABLE "patient_history"`);
    await queryRunner.query(
      `DROP TYPE "public"."patient_history_entry_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c305f725faf61200f668e28f77"`,
    );
    await queryRunner.query(`DROP TABLE "ai_sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9e5fc47ecb06d4d7b84633b171"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_81eba089f810c972e8c4dee15b"`,
    );
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP TYPE "public"."chat_messages_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e4450c9f7a8b4bd055311d46fd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_94824eac901cfb902526e59f81"`,
    );
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eefa239f3536811d445eae9250"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_402264ba8208a27caf6e6940b3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bbd6ac6e3e6a8f8c6e0e8692d6"`,
    );
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0bd2a15bde4058590f0caea36b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e86edf76dc2424f123b9023a2b"`,
    );
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."payments_gateway_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9389db557647131856661f7d7b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2d6a1941bd705056030c2b9e07"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fa3ddba7c8c2952d18bb1bf9a8"`,
    );
    await queryRunner.query(`DROP TABLE "prescriptions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0fd54ced5cc75f7cb92925dd80"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_69995f9059305ab7a9c52cdb10"`,
    );
    await queryRunner.query(`DROP TABLE "doctor_profiles"`);
    await queryRunner.query(
      `DROP TYPE "public"."doctor_profiles_approval_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1d3079bc725e24c2e27ce14141"`,
    );
    await queryRunner.query(`DROP TABLE "test_catalogue"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9529b317c0649cffda924e08d0"`,
    );
    await queryRunner.query(`DROP TABLE "medicine_catalogue"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6032c61b58b8a647e13a4b20c5"`,
    );
    await queryRunner.query(`DROP TABLE "doctor_availability"`);
    await queryRunner.query(
      `DROP TYPE "public"."doctor_availability_day_of_week_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e296010b9088277148d109ba75"`,
    );
    await queryRunner.query(`DROP TABLE "patient_profiles"`);
  }
}
