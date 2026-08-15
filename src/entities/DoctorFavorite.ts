import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A patient's own saved/favorited doctor — purely patient-scoped (no
// tenant/admin permission gating), same precedent as ArticleBookmark.
@Entity('doctor_favorites')
@Unique(['patientId', 'doctorProfileId'])
export class DoctorFavorite extends BaseEntity {
  @Column({ name: 'patient_id' })
  @Index()
  patientId!: string;

  // References DoctorProfile.id (the same id the /doctors/:id route and
  // mobile Doctor.id use) — not the User id.
  @Column({ name: 'doctor_profile_id' })
  @Index()
  doctorProfileId!: string;
}
