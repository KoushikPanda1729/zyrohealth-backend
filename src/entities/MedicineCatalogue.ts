import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { DoctorProfile } from './DoctorProfile';

@Entity('medicine_catalogue')
export class MedicineCatalogue extends BaseEntity {
  @Column({ name: 'doctor_profile_id' })
  @Index()
  doctorProfileId!: string;

  @ManyToOne(() => DoctorProfile, (profile) => profile.medicines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'doctor_profile_id' })
  doctorProfile!: DoctorProfile;

  @Column()
  name!: string;

  @Column({ nullable: true })
  genericName?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ nullable: true })
  defaultDosage?: string;

  @Column({ nullable: true })
  defaultFrequency?: string;

  @Column({ nullable: true })
  defaultDuration?: string;

  @Column({ nullable: true })
  defaultRoute?: string;

  @Column({ nullable: true })
  notes?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
