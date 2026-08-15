import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A patient's own cycle-tracking settings — purely patient-scoped (no
// tenant/admin permission gating), same precedent as ArticleBookmark /
// DoctorFavorite / AmbulanceRequest. One row per patient (upserted).
@Entity('menstrual_cycle_logs')
export class MenstrualCycleLog extends BaseEntity {
  @Column({ name: 'patient_id', unique: true })
  @Index()
  patientId!: string;

  @Column({ name: 'cycle_length_days', default: 28 })
  cycleLengthDays!: number;

  @Column({ name: 'period_length_days', default: 5 })
  periodLengthDays!: number;

  @Column({ name: 'last_period_start_date', type: 'date' })
  lastPeriodStartDate!: string;
}
