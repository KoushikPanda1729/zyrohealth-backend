import { MigrationInterface, QueryRunner } from 'typeorm';

// Full HR module for medicine shop staff: custom module-wise roles
// (replacing the old fixed owner/cashier-only gate for delegable
// actions), attendance (self check-in/out + owner manual marking), leave
// (staff request/approve + owner direct-mark, both feeding the same
// table), and payroll (attendance-derived, with optional statutory
// deductions). The owner keeps unconditional full access regardless of
// any role — see attachRole.middleware.ts.
export class AddShopStaffRolesAttendanceLeavePayroll1780000034000
  implements MigrationInterface
{
  name = 'AddShopStaffRolesAttendanceLeavePayroll1780000034000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── medicine_shop_roles ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" character varying,
        "is_system" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_medicine_shop_roles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_roles_shop_id" ON "medicine_shop_roles" ("shop_id")`,
    );

    // ── medicine_shop_role_permissions ─────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_role_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "role_id" character varying NOT NULL,
        "permission_key" character varying NOT NULL,
        CONSTRAINT "PK_medicine_shop_role_permissions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_role_permissions_role_id" ON "medicine_shop_role_permissions" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_medicine_shop_role_permissions_role_key" ON "medicine_shop_role_permissions" ("role_id", "permission_key")`,
    );

    // ── users: shop_role_id ─────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "shop_role_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_shop_role_id" ON "users" ("shop_role_id")`,
    );

    // ── medicine_shop_attendance ────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_attendance_status_enum" AS ENUM('present', 'absent', 'half_day', 'leave')`,
    );
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_attendance_marked_by_enum" AS ENUM('self', 'owner')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_attendance" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "staff_user_id" character varying NOT NULL,
        "date" date NOT NULL,
        "check_in_at" TIMESTAMPTZ,
        "check_out_at" TIMESTAMPTZ,
        "status" "medicine_shop_attendance_status_enum" NOT NULL DEFAULT 'present',
        "marked_by" "medicine_shop_attendance_marked_by_enum" NOT NULL,
        "marked_by_user_id" character varying NOT NULL,
        "notes" character varying,
        CONSTRAINT "PK_medicine_shop_attendance" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_attendance_shop_id" ON "medicine_shop_attendance" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_medicine_shop_attendance_staff_date" ON "medicine_shop_attendance" ("staff_user_id", "date")`,
    );

    // ── medicine_shop_leave_requests ────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_leave_requests_status_enum" AS ENUM('pending', 'approved', 'rejected', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_leave_requests_created_via_enum" AS ENUM('staff_request', 'owner_direct')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_leave_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "staff_user_id" character varying NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "days" integer NOT NULL,
        "reason" character varying,
        "status" "medicine_shop_leave_requests_status_enum" NOT NULL DEFAULT 'pending',
        "created_via" "medicine_shop_leave_requests_created_via_enum" NOT NULL,
        "decided_by_user_id" character varying,
        "decided_at" TIMESTAMPTZ,
        "decision_note" character varying,
        "is_paid" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_medicine_shop_leave_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_leave_requests_shop_id" ON "medicine_shop_leave_requests" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_leave_requests_staff_user_id" ON "medicine_shop_leave_requests" ("staff_user_id")`,
    );

    // ── medicine_shop_staff_profiles ────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_staff_profiles_payroll_mode_enum" AS ENUM('simple', 'statutory')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_staff_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "user_id" character varying NOT NULL,
        "shop_id" character varying NOT NULL,
        "employee_code" character varying,
        "joined_at" date,
        "monthly_base_salary_cents" integer NOT NULL DEFAULT 0,
        "annual_leave_quota" integer NOT NULL DEFAULT 12,
        "payroll_mode" "medicine_shop_staff_profiles_payroll_mode_enum" NOT NULL DEFAULT 'simple',
        "pf_enabled" boolean NOT NULL DEFAULT false,
        "pf_employee_percent" numeric(5,2) NOT NULL DEFAULT 12,
        "esi_enabled" boolean NOT NULL DEFAULT false,
        "esi_employee_percent" numeric(5,2) NOT NULL DEFAULT 0.75,
        "professional_tax_enabled" boolean NOT NULL DEFAULT false,
        "professional_tax_cents" integer NOT NULL DEFAULT 0,
        "tds_enabled" boolean NOT NULL DEFAULT false,
        "tds_percent" numeric(5,2) NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_medicine_shop_staff_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_medicine_shop_staff_profiles_user_id" UNIQUE ("user_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_staff_profiles_shop_id" ON "medicine_shop_staff_profiles" ("shop_id")`,
    );

    // ── medicine_shop_payroll_records ───────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "medicine_shop_payroll_records_status_enum" AS ENUM('draft', 'finalized', 'paid')`,
    );
    await queryRunner.query(`
      CREATE TABLE "medicine_shop_payroll_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "shop_id" character varying NOT NULL,
        "staff_user_id" character varying NOT NULL,
        "month" character varying NOT NULL,
        "working_days_in_month" integer NOT NULL,
        "present_days" integer NOT NULL,
        "half_days" integer NOT NULL,
        "paid_leave_days" integer NOT NULL,
        "unpaid_leave_days" integer NOT NULL,
        "absent_days" integer NOT NULL,
        "base_salary_cents" integer NOT NULL,
        "pro_rated_gross_cents" integer NOT NULL,
        "adjustments" jsonb NOT NULL DEFAULT '[]',
        "bonus_cents" integer NOT NULL DEFAULT 0,
        "deduction_cents" integer NOT NULL DEFAULT 0,
        "pf_deduction_cents" integer NOT NULL DEFAULT 0,
        "esi_deduction_cents" integer NOT NULL DEFAULT 0,
        "professional_tax_cents" integer NOT NULL DEFAULT 0,
        "tds_cents" integer NOT NULL DEFAULT 0,
        "net_pay_cents" integer NOT NULL,
        "status" "medicine_shop_payroll_records_status_enum" NOT NULL DEFAULT 'draft',
        "paid_at" TIMESTAMPTZ,
        "paid_via" character varying,
        "notes" character varying,
        CONSTRAINT "PK_medicine_shop_payroll_records" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_medicine_shop_payroll_records_shop_id" ON "medicine_shop_payroll_records" ("shop_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_medicine_shop_payroll_records_staff_month" ON "medicine_shop_payroll_records" ("staff_user_id", "month")`,
    );

    // ── permission catalog: new shop-scoped, module-wise keys ──────────
    // Distinct namespace (shop_*) from the tenant-admin-side
    // medicine_shops.* keys — these are only ever referenced by
    // medicine_shop_role_permissions, never by the tenant Role/
    // TenantPermission system. Billing/catalog-view/customers/quote-
    // requests stay ungated (open to any shop staff) to match existing
    // cashier behavior exactly — only the actions that were previously
    // hard-gated by requireShopOwner become delegable permissions here.
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "module", "description") VALUES
        ('shop_catalog.manage', 'shop_staff', 'Create/edit/delete catalog items, batches, bulk-upload, adjust stock'),
        ('shop_suppliers.manage', 'shop_staff', 'Create/edit/delete suppliers'),
        ('shop_purchase_orders.manage', 'shop_staff', 'Create/edit/send/receive/cancel purchase orders'),
        ('shop_supplier_prices.manage', 'shop_staff', 'Record/edit distributor price comparisons'),
        ('shop_reports.view', 'shop_staff', 'View daily reconciliation and sales analytics'),
        ('shop_staff.manage', 'shop_staff', 'Invite/deactivate staff, create/edit custom roles and permissions'),
        ('shop_attendance.manage', 'shop_staff', 'Mark or correct attendance for other staff members'),
        ('shop_leave.manage', 'shop_staff', 'Approve/reject leave requests, mark leave directly for other staff'),
        ('shop_payroll.manage', 'shop_staff', 'Configure salary/statutory settings, generate and finalize payroll'),
        ('shop_payroll.view', 'shop_staff', 'View other staff members'' payroll records and payslips')
    `);

    // ── seed a default "Cashier" system role for every existing shop ───
    // Matches today's exact cashier capability (none of the above
    // manage-permissions) — the owner can grant more via the Roles tab
    // afterwards. Kept undeletable (is_system) so a shop never ends up
    // with zero assignable non-owner role.
    await queryRunner.query(`
      INSERT INTO "medicine_shop_roles" ("shop_id", "name", "description", "is_system")
      SELECT "id", 'Cashier', 'Default role — can bill at the counter and view shop data, cannot manage catalog, suppliers, staff, or reports.', true
      FROM "medicine_shops"
    `);

    // ── backfill existing cashier users onto their shop's default role ─
    await queryRunner.query(`
      UPDATE "users" u
      SET "shop_role_id" = r."id"
      FROM "medicine_shop_roles" r
      WHERE u."shop_staff_role" = 'cashier'
        AND u."shop_id" = r."shop_id"
        AND r."name" = 'Cashier'
        AND r."is_system" = true
        AND u."shop_role_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_shop_payroll_records"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_shop_payroll_records_status_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_shop_staff_profiles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_shop_staff_profiles_payroll_mode_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_shop_leave_requests"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_shop_leave_requests_created_via_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_shop_leave_requests_status_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_shop_attendance"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_shop_attendance_marked_by_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "medicine_shop_attendance_status_enum"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "shop_role_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_shop_role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "medicine_shop_roles"`);

    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "key" IN (
        'shop_catalog.manage', 'shop_suppliers.manage', 'shop_purchase_orders.manage',
        'shop_supplier_prices.manage', 'shop_reports.view', 'shop_staff.manage',
        'shop_attendance.manage', 'shop_leave.manage', 'shop_payroll.manage', 'shop_payroll.view'
      )
    `);
  }
}
