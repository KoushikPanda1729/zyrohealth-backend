import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { DoctorProfile } from './DoctorProfile';

@Entity('test_catalogue')
export class TestCatalogue extends BaseEntity {
  @Column({ name: 'doctor_profile_id' })
  @Index()
  doctorProfileId!: string;

  @ManyToOne(() => DoctorProfile, (profile) => profile.tests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'doctor_profile_id' })
  doctorProfile!: DoctorProfile;

  @Column()
  name!: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  defaultInstructions?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
