import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum LeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

// Distinguishes a staff-initiated request (needs owner/manager approval)
// from the owner directly marking someone on leave (auto-approved, no
// request step) — both flows write to this same table so leave balance
// and payroll only ever need one source of truth.
export enum LeaveCreatedVia {
  STAFF_REQUEST = 'staff_request',
  OWNER_DIRECT = 'owner_direct',
}

@Entity('medicine_shop_leave_requests')
export class MedicineShopLeaveRequest extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'staff_user_id' })
  @Index()
  staffUserId!: string;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: string;

  // Inclusive day count — stored rather than recomputed everywhere since
  // it's read constantly by the leave-balance calculation.
  @Column({ name: 'days' })
  days!: number;

  @Column({ nullable: true })
  reason?: string;

  @Column({ type: 'enum', enum: LeaveStatus, default: LeaveStatus.PENDING })
  status!: LeaveStatus;

  @Column({ type: 'enum', enum: LeaveCreatedVia, name: 'created_via' })
  createdVia!: LeaveCreatedVia;

  @Column({ nullable: true, name: 'decided_by_user_id' })
  decidedByUserId?: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'decided_at' })
  decidedAt?: Date;

  @Column({ nullable: true, name: 'decision_note' })
  decisionNote?: string;

  // Whether this leave counted against the staff member's paid quota at
  // approval time, or ran over into unpaid — decided once at approval
  // (see leave.util.ts) and kept stable afterwards even if the quota
  // config changes later.
  @Column({ default: true, name: 'is_paid' })
  isPaid!: boolean;
}
