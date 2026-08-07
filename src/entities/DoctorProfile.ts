import {
  Entity,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';
import { DoctorAvailability } from './DoctorAvailability';
import { MedicineCatalogue } from './MedicineCatalogue';
import { TestCatalogue } from './TestCatalogue';
import { DoctorDocument } from './DoctorDocument';

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('doctor_profiles')
export class DoctorProfile extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  @OneToOne(() => User, (user) => user.doctorProfile)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ nullable: true })
  specialty?: string;

  @Column({ nullable: true, name: 'license_number' })
  licenseNumber?: string;

  @Column({ name: 'years_of_experience', nullable: true })
  yearsOfExperience?: number;

  @Column({ type: 'text', array: true, default: '{}' })
  languages!: string[];

  @Column({
    type: 'enum',
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING,
    name: 'approval_status',
  })
  approvalStatus!: ApprovalStatus;

  @Column({ name: 'is_available', default: false })
  isAvailable!: boolean;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'consultation_fee',
  })
  consultationFee?: number;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
    nullable: true,
  })
  rating?: number;

  @Column({ name: 'total_reviews', default: 0 })
  totalReviews!: number;

  @Column({ name: 'total_consultations', default: 0 })
  totalConsultations!: number;

  @Column({ nullable: true })
  bio?: string;

  @Column({ nullable: true, name: 'profile_picture_url' })
  profilePictureUrl?: string;

  @Column({ nullable: true, name: 'rejection_reason' })
  rejectionReason?: string;

  @Column({ type: 'text', array: true, default: '{}' })
  qualifications!: string[];

  @OneToMany(() => DoctorAvailability, (avail) => avail.doctorProfile)
  availabilities!: DoctorAvailability[];

  @OneToMany(() => MedicineCatalogue, (med) => med.doctorProfile)
  medicines!: MedicineCatalogue[];

  @OneToMany(() => TestCatalogue, (test) => test.doctorProfile)
  tests!: TestCatalogue[];

  @OneToMany(() => DoctorDocument, (doc) => doc.doctorProfile)
  documents!: DoctorDocument[];
}
