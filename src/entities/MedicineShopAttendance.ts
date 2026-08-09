import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  HALF_DAY = 'half_day',
  LEAVE = 'leave',
}

export enum AttendanceMarkedBy {
  SELF = 'self',
  OWNER = 'owner',
}

// One row per staff member per calendar day. Supports both self
// check-in/out (staff mark their own arrival/departure) and manual
// marking by the owner/a manager (shop_attendance.manage permission) —
// the manual path always wins if both happen for the same day, tracked
// via markedBy/markedByUserId so it's clear which one produced the row.
// LEAVE rows are written here automatically when a leave request is
// approved (see leave.util.ts), so payroll only ever needs to read this
// one table to know a staff member's paid/unpaid day breakdown for a
// month.
@Entity('medicine_shop_attendance')
@Index(['staffUserId', 'date'], { unique: true })
export class MedicineShopAttendance extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'staff_user_id' })
  @Index()
  staffUserId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'check_in_at' })
  checkInAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'check_out_at' })
  checkOutAt?: Date | null;

  @Column({ type: 'enum', enum: AttendanceStatus, default: AttendanceStatus.PRESENT })
  status!: AttendanceStatus;

  @Column({ type: 'enum', enum: AttendanceMarkedBy, name: 'marked_by' })
  markedBy!: AttendanceMarkedBy;

  @Column({ name: 'marked_by_user_id' })
  markedByUserId!: string;

  @Column({ nullable: true })
  notes?: string;
}
