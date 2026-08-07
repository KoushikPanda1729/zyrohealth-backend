import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { DoctorProfile } from './DoctorProfile';

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

@Entity('doctor_availability')
export class DoctorAvailability extends BaseEntity {
  @Column({ name: 'doctor_profile_id' })
  @Index()
  doctorProfileId!: string;

  @ManyToOne(() => DoctorProfile, (profile) => profile.availabilities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'doctor_profile_id' })
  doctorProfile!: DoctorProfile;

  @Column({ type: 'enum', enum: DayOfWeek, name: 'day_of_week' })
  dayOfWeek!: DayOfWeek;

  @Column({ name: 'start_time' })
  startTime!: string;

  @Column({ name: 'end_time' })
  endTime!: string;

  @Column({ name: 'slot_duration_minutes', default: 30 })
  slotDurationMinutes!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
