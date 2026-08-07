import {
  Entity,
  Column,
  OneToOne,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { Booking } from './Booking';
import { User } from './User';

@Entity('reviews')
export class Review extends BaseEntity {
  @Column({ name: 'booking_id' })
  @Index()
  bookingId!: string;

  @OneToOne(() => Booking, (b) => b.review)
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'patient_id' })
  @Index()
  patientId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'patient_id' })
  patient!: User;

  @Column({ name: 'doctor_id' })
  @Index()
  doctorId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'doctor_id' })
  doctor!: User;

  @Column({ type: 'int' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment?: string;
}
