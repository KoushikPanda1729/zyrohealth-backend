import { MigrationInterface, QueryRunner } from 'typeorm';

// Permission catalog — global, platform-defined, grouped by module. Kept in
// one place so this migration and any future reseed stay in sync.
const PERMISSIONS: { key: string; module: string; description: string }[] = [
  { key: 'users.view', module: 'users', description: 'View platform users' },
  {
    key: 'users.manage',
    module: 'users',
    description: 'Ban/unban and manage users',
  },
  {
    key: 'doctors.view',
    module: 'doctors',
    description: 'View doctor profiles and documents',
  },
  {
    key: 'doctors.manage',
    module: 'doctors',
    description: 'Approve/reject doctors, edit profiles, manage availability',
  },
  { key: 'bookings.view', module: 'bookings', description: 'View bookings' },
  {
    key: 'bookings.manage',
    module: 'bookings',
    description: 'Refund and manage bookings',
  },
  {
    key: 'prescriptions.view',
    module: 'prescriptions',
    description: 'View prescriptions',
  },
  {
    key: 'medicine_orders.view',
    module: 'medicine_orders',
    description: 'View medicine orders',
  },
  {
    key: 'medicine_orders.manage',
    module: 'medicine_orders',
    description: 'Update medicine order status',
  },
  { key: 'payments.view', module: 'payments', description: 'View payments' },
  { key: 'payments.manage', module: 'payments', description: 'Issue refunds' },
  {
    key: 'whatsapp.view',
    module: 'whatsapp',
    description: 'View WhatsApp sessions',
  },
  {
    key: 'whatsapp.manage_sessions',
    module: 'whatsapp',
    description: 'Reply to and resume WhatsApp sessions',
  },
  {
    key: 'whatsapp.manage_flows',
    module: 'whatsapp',
    description: 'Create, edit and activate WhatsApp flows',
  },
  {
    key: 'voice_agent.view',
    module: 'voice_agent',
    description: 'View voice agents and phone numbers',
  },
  {
    key: 'voice_agent.manage',
    module: 'voice_agent',
    description: 'Manage voice agents and the phone number pool',
  },
  {
    key: 'ai_doctors.view',
    module: 'ai_doctors',
    description: 'View AI doctor configs',
  },
  {
    key: 'ai_doctors.manage',
    module: 'ai_doctors',
    description: 'Create and edit AI doctor configs',
  },
  {
    key: 'analytics.view',
    module: 'analytics',
    description: 'View analytics dashboards',
  },
  {
    key: 'roles.manage',
    module: 'roles',
    description: "Manage this tenant's custom staff roles",
  },
];

export class AddTenantsRolesPermissions1780000012000 implements MigrationInterface {
  name = 'AddTenantsRolesPermissions1780000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "contact_email" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "deactivated_at" TIMESTAMP,
        "whatsapp_from_number" character varying,
        CONSTRAINT "PK_tenants" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "key" character varying NOT NULL,
        "module" character varying NOT NULL,
        "description" character varying NOT NULL,
        CONSTRAINT "UQ_permissions_key" UNIQUE ("key"),
        CONSTRAINT "PK_permissions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying NOT NULL,
        "permission_key" character varying NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_tenant_permissions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_tenant_permissions_tenant_key" ON "tenant_permissions" ("tenant_id", "permission_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_permissions_tenant_id" ON "tenant_permissions" ("tenant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "tenant_id" character varying,
        "name" character varying NOT NULL,
        "is_system" boolean NOT NULL DEFAULT false,
        "description" character varying,
        CONSTRAINT "PK_roles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_roles_tenant_id" ON "roles" ("tenant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "role_id" character varying NOT NULL,
        "permission_key" character varying NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_role_permissions_role_key" ON "role_permissions" ("role_id", "permission_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_role_permissions_role_id" ON "role_permissions" ("role_id")`,
    );

    // Seed the permission catalog.
    for (const p of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("key", "module", "description") VALUES ($1, $2, $3)`,
        [p.key, p.module, p.description],
      );
    }

    // Seed the default tenant that all existing (pre-multi-tenancy) data
    // will be backfilled into by the two migrations that follow this one.
    await queryRunner.query(
      `INSERT INTO "tenants" ("name", "contact_email", "is_active") VALUES ('HealthPlus', 'admin@fullhealth.com', true)`,
    );

    // Entitle the default tenant to every permission — the existing admin
    // account already has full access today; this must not regress it.
    await queryRunner.query(`
      INSERT INTO "tenant_permissions" ("tenant_id", "permission_key", "is_active")
      SELECT t.id, p.key, true
      FROM "tenants" t, "permissions" p
      WHERE t.name = 'HealthPlus'
    `);

    // A platform-level template role for super admins (tenantId = null),
    // plus the default tenant's own "Admin" role — both granted every
    // permission so nothing existing regresses.
    await queryRunner.query(
      `INSERT INTO "roles" ("tenant_id", "name", "is_system") VALUES (NULL, 'Super Admin', true)`,
    );
    await queryRunner.query(`
      INSERT INTO "roles" ("tenant_id", "name", "is_system")
      SELECT t.id, 'Admin', true FROM "tenants" t WHERE t.name = 'HealthPlus'
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_key")
      SELECT r.id, p.key
      FROM "roles" r, "permissions" p
      WHERE r.name IN ('Super Admin', 'Admin')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "tenant_permissions"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
  }
}
