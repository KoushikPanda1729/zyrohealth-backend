import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHospitalsAndAmbulanceRequests1780000046000 implements MigrationInterface {
  name = 'AddHospitalsAndAmbulanceRequests1780000046000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── hospitals ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "hospitals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "contact_phone" character varying NOT NULL,
        "address_line1" character varying,
        "city" character varying,
        "specialties" text[] NOT NULL DEFAULT '{}',
        "emergency_services_available" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_hospitals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_hospitals_tenant_id" ON "hospitals" ("tenant_id")`,
    );

    // ── ambulance_requests ──────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "ambulance_requests_status_enum" AS ENUM('requested', 'acknowledged', 'completed', 'cancelled')`,
    );
    await queryRunner.query(`
      CREATE TABLE "ambulance_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "hospital_id" character varying NOT NULL,
        "patient_id" character varying NOT NULL,
        "pickup_address" character varying NOT NULL,
        "contact_phone" character varying NOT NULL,
        "notes" text,
        "status" "ambulance_requests_status_enum" NOT NULL DEFAULT 'requested',
        "admin_notes" text,
        "cancel_reason" character varying,
        "resolved_at" TIMESTAMPTZ,
        CONSTRAINT "PK_ambulance_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ambulance_requests_tenant_id" ON "ambulance_requests" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ambulance_requests_hospital_id" ON "ambulance_requests" ("hospital_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ambulance_requests_patient_id" ON "ambulance_requests" ("patient_id")`,
    );

    // ── module permissions ──────────────────────────────────────────────
    await queryRunner.query(
      `INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('hospitals.view', 'hospitals', 'View the hospital directory'),
        ('hospitals.manage', 'hospitals', 'Add and edit hospitals in the directory'),
        ('ambulance.view', 'ambulance', 'View incoming ambulance requests'),
        ('ambulance.manage', 'ambulance', 'Acknowledge and resolve ambulance requests')`,
    );

    // Same backfill precedent as every other new module (see e.g.
    // AddMedicineShopsAndPrescriptionUploads) — only the pre-existing
    // 'HealthPlus' tenant gets this for free, so its admin isn't blocked
    // from a brand new module it had no way to opt into. Every other
    // tenant follows the normal path: a super admin enables it via tenant
    // entitlements like any other module.
    await queryRunner.query(`
      INSERT INTO "tenant_permissions" ("tenant_id", "permission_key", "is_active")
      SELECT t.id, p.key, true
      FROM "tenants" t, "permissions" p
      WHERE t.name = 'HealthPlus'
        AND p.key IN ('hospitals.view', 'hospitals.manage', 'ambulance.view', 'ambulance.manage')
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_key")
      SELECT r.id, p.key
      FROM "roles" r, "permissions" p
      WHERE r.name = 'Admin' AND r.is_system = true
        AND r.tenant_id IN (SELECT id::varchar FROM "tenants" WHERE name = 'HealthPlus')
        AND p.key IN ('hospitals.view', 'hospitals.manage', 'ambulance.view', 'ambulance.manage')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_key" IN ('hospitals.view', 'hospitals.manage', 'ambulance.view', 'ambulance.manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "tenant_permissions" WHERE "permission_key" IN ('hospitals.view', 'hospitals.manage', 'ambulance.view', 'ambulance.manage')`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" IN ('hospitals.view', 'hospitals.manage', 'ambulance.view', 'ambulance.manage')`,
    );
    await queryRunner.query(`DROP TABLE "ambulance_requests"`);
    await queryRunner.query(`DROP TYPE "ambulance_requests_status_enum"`);
    await queryRunner.query(`DROP TABLE "hospitals"`);
  }
}
