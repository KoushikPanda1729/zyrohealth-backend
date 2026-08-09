import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum PayrollMode {
  // Base salary pro-rated by attendance, plus any one-off bonuses/
  // deductions the owner adds — no statutory deductions computed.
  SIMPLE = 'simple',
  // All of the above, plus PF/ESI/professional tax/TDS deducted using the
  // rates configured below.
  STATUTORY = 'statutory',
}

// Payroll config for one staff member at one shop — created lazily the
// first time an owner opens the Payroll tab for that staff member (see
// payroll.util.ts#getOrCreateStaffProfile), not at invite time, since
// salary is usually set up separately from account creation.
//
// The statutory fields (PF/ESI/professional tax/TDS) use commonly-known
// standard rates as defaults (EPF 12%, ESI 0.75% employee share below the
// ₹21,000 gross threshold) but are fully owner-editable per staff member.
// This is NOT certified payroll-compliance software — rates change,
// thresholds vary, and TDS in particular depends on the employee's full
// annual tax situation. The UI must say so; treat these as a configurable
// starting point, not an authority.
@Entity('medicine_shop_staff_profiles')
export class MedicineShopStaffProfile extends BaseEntity {
  @Column({ name: 'user_id', unique: true })
  @Index()
  userId!: string;

  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ nullable: true, name: 'employee_code' })
  employeeCode?: string;

  @Column({ type: 'date', nullable: true, name: 'joined_at' })
  joinedAt?: string;

  @Column({ name: 'monthly_base_salary_cents', default: 0 })
  monthlyBaseSalaryCents!: number;

  // Paid leave days accrued per calendar year (not per month) — kept
  // simple on purpose; see leave.util.ts for how balance is derived from
  // this plus approved leave already taken.
  @Column({ name: 'annual_leave_quota', default: 12 })
  annualLeaveQuota!: number;

  @Column({ type: 'enum', enum: PayrollMode, default: PayrollMode.SIMPLE, name: 'payroll_mode' })
  payrollMode!: PayrollMode;

  @Column({ name: 'pf_enabled', default: false })
  pfEnabled!: boolean;

  @Column({ name: 'pf_employee_percent', type: 'numeric', precision: 5, scale: 2, default: 12 })
  pfEmployeePercent!: number;

  @Column({ name: 'esi_enabled', default: false })
  esiEnabled!: boolean;

  @Column({ name: 'esi_employee_percent', type: 'numeric', precision: 5, scale: 2, default: 0.75 })
  esiEmployeePercent!: number;

  @Column({ name: 'professional_tax_enabled', default: false })
  professionalTaxEnabled!: boolean;

  @Column({ name: 'professional_tax_cents', default: 0 })
  professionalTaxCents!: number;

  @Column({ name: 'tds_enabled', default: false })
  tdsEnabled!: boolean;

  @Column({ name: 'tds_percent', type: 'numeric', precision: 5, scale: 2, default: 0 })
  tdsPercent!: number;

  @Column({ default: true, name: 'is_active' })
  isActive!: boolean;
}
