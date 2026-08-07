import { Entity, Column, OneToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { Booking } from './Booking';

export interface PrescribedMedicine {
  name: string;
  genericName?: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  notes?: string;
}

export interface OrderedTest {
  name: string;
  category?: string;
  instructions?: string;
}

@Entity('prescriptions')
export class Prescription extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'booking_id' })
  @Index()
  bookingId!: string;

  @OneToOne(() => Booking, (b) => b.prescription)
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'doctor_id' })
  @Index()
  doctorId!: string;

  @Column({ name: 'patient_id' })
  @Index()
  patientId!: string;

  @Column({ nullable: true })
  diagnosis?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'jsonb', default: '[]' })
  medicines!: PrescribedMedicine[];

  @Column({ type: 'jsonb', default: '[]' })
  tests!: OrderedTest[];

  @Column({ name: 'pdf_url', nullable: true })
  pdfUrl?: string;

  @Column({ name: 'is_sent', default: false })
  isSent!: boolean;

  @Column({ name: 'confirmed_allergy_override', default: false })
  confirmedAllergyOverride!: boolean;
}
