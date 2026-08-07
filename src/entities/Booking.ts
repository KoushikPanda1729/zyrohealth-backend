import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';
import { Prescription } from './Prescription';
import { Payment } from './Payment';
import { Review } from './Review';

export enum BookingStatus {
  PENDING = 'pending',
  PAID = 'paid',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ConsultationType {
  VIDEO = 'video',
  OFFLINE = 'offline',
}

@Entity('bookings')
export class Booking extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'patient_id' })
  @Index()
  patientId!: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'patient_id' })
  patient!: User;

  @Column({ name: 'doctor_id' })
  @Index()
  doctorId!: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: User;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status!: BookingStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'duration_minutes', default: 30 })
  durationMinutes!: number;

  @Column({ name: 'video_room_id', unique: true })
  videoRoomId!: string;

  @Column({ name: 'consultation_fee_cents', type: 'int' })
  consultationFeeCents!: number;

  @Column({
    name: 'consultation_type',
    type: 'enum',
    enum: ConsultationType,
    default: ConsultationType.VIDEO,
  })
  consultationType!: ConsultationType;

  @Column({ name: 'ai_session_id', nullable: true })
  aiSessionId?: string;

  @Column({ name: 'ai_summary', type: 'text', nullable: true })
  aiSummary?: string;

  @Column({ name: 'cancel_reason', nullable: true })
  cancelReason?: string;

  @Column({ name: 'cancelled_by', nullable: true })
  cancelledBy?: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @OneToOne(() => Prescription, (p) => p.booking, { nullable: true })
  prescription?: Prescription;

  @OneToOne(() => Payment, (p) => p.booking, { nullable: true })
  payment?: Payment;

  @OneToOne(() => Review, (r) => r.booking, { nullable: true })
  review?: Review;
}
