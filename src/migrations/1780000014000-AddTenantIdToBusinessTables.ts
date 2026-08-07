import { MigrationInterface, QueryRunner } from 'typeorm';

// Every top-level aggregate that's queried directly (not just reachable
// through a parent) gets a tenant_id column, backfilled into the default
// tenant seeded by 1780000012000-AddTenantsRolesPermissions.ts.
const TABLES = [
  'doctor_profiles',
  'patient_profiles',
  'bookings',
  'prescriptions',
  'medicine_orders',
  'payments',
  'whatsapp_sessions',
  'whatsapp_flows',
  'ai_doctors',
  'ai_sessions',
  'voice_agents',
  'voice_agent_phone_numbers',
];

export class AddTenantIdToBusinessTables1780000014000 implements MigrationInterface {
  name = 'AddTenantIdToBusinessTables1780000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "tenant_id" character varying`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_${table}_tenant_id" ON "${table}" ("tenant_id")`,
      );
      await queryRunner.query(`
        UPDATE "${table}"
        SET "tenant_id" = (SELECT id FROM "tenants" WHERE name = 'HealthPlus' LIMIT 1)
        WHERE "tenant_id" IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "tenant_id"`,
      );
    }
  }
}
