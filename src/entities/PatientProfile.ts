import { Entity, Column, OneToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';

@Entity('patient_profiles')
export class PatientProfile extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  @OneToOne(() => User, (user) => user.patientProfile)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: Date;

  @Column({ nullable: true })
  gender?: string;

  @Column({ name: 'blood_group', nullable: true })
  bloodGroup?: string;

  @Column({ type: 'text', array: true, default: '{}' })
  allergies!: string[];

  @Column({
    name: 'chronic_conditions',
    type: 'text',
    array: true,
    default: '{}',
  })
  chronicConditions!: string[];

  @Column({ nullable: true, name: 'profile_picture_url' })
  profilePictureUrl?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true, name: 'emergency_contact_name' })
  emergencyContactName?: string;

  @Column({ nullable: true, name: 'emergency_contact_phone' })
  emergencyContactPhone?: string;
}
