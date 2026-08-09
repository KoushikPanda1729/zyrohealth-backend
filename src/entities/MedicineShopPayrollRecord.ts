import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum PayrollRecordStatus {
  // Auto-computed from attendance, still editable (owner can add
  // bonuses/deductions, re-generate to pick up late attendance edits).
  DRAFT = 'draft',
  // Locked — no further attendance changes affect this record.
  FINALIZED = 'finalized',
  // Finalized and the owner has recorded that the staff member was paid.
  PAID = 'paid',
}

export interface PayrollAdjustment {
  label: string;
  amountCents: number;
  type: 'bonus' | 'deduction';
}

// One row per staff member per calendar month — the generated payslip.
// Regenerating a draft record overwrites the attendance-derived fields
// but preserves owner-added adjustments (see payroll.util.ts).
@Entity('medicine_shop_payroll_records')
@Index(['staffUserId', 'month'], { unique: true })
export class MedicineShopPayrollRecord extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'staff_user_id' })
  @Index()
  staffUserId!: string;

  // 'YYYY-MM'
  @Column()
  month!: string;

  @Column({ name: 'working_days_in_month' })
  workingDaysInMonth!: number;

  @Column({ name: 'present_days' })
  presentDays!: number;

  @Column({ name: 'half_days' })
  halfDays!: number;

  @Column({ name: 'paid_leave_days' })
  paidLeaveDays!: number;

  @Column({ name: 'unpaid_leave_days' })
  unpaidLeaveDays!: number;

  @Column({ name: 'absent_days' })
  absentDays!: number;

  @Column({ name: 'base_salary_cents' })
  baseSalaryCents!: number;

  // base_salary_cents pro-rated by (present + half*0.5 + paid_leave) /
  // working_days_in_month.
  @Column({ name: 'pro_rated_gross_cents' })
  proRatedGrossCents!: number;

  @Column({ type: 'jsonb', default: '[]' })
  adjustments!: PayrollAdjustment[];

  @Column({ name: 'bonus_cents', default: 0 })
  bonusCents!: number;

  @Column({ name: 'deduction_cents', default: 0 })
  deductionCents!: number;

  @Column({ name: 'pf_deduction_cents', default: 0 })
  pfDeductionCents!: number;

  @Column({ name: 'esi_deduction_cents', default: 0 })
  esiDeductionCents!: number;

  @Column({ name: 'professional_tax_cents', default: 0 })
  professionalTaxCents!: number;

  @Column({ name: 'tds_cents', default: 0 })
  tdsCents!: number;

  @Column({ name: 'net_pay_cents' })
  netPayCents!: number;

  @Column({ type: 'enum', enum: PayrollRecordStatus, default: PayrollRecordStatus.DRAFT })
  status!: PayrollRecordStatus;

  @Column({ type: 'timestamptz', nullable: true, name: 'paid_at' })
  paidAt?: Date;

  @Column({ nullable: true, name: 'paid_via' })
  paidVia?: string;

  @Column({ nullable: true })
  notes?: string;
}
