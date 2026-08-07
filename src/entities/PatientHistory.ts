import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';

export enum HistoryEntryType {
  AI_CHAT = 'ai_chat',
  CONSULT = 'consult',
  PRESCRIPTION = 'prescription',
}

@Entity('patient_history')
export class PatientHistory extends BaseEntity {
  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'enum',
    enum: HistoryEntryType,
    name: 'entry_type',
  })
  entryType!: HistoryEntryType;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ name: 'reference_id', nullable: true })
  referenceId?: string;

  @Column({
    name: 'detected_symptoms',
    type: 'text',
    array: true,
    default: '{}',
  })
  detectedSymptoms!: string[];

  @Column({ name: 'severity_score', type: 'int', nullable: true })
  severityScore?: number;

  @Column({ name: 'doctor_name', nullable: true })
  doctorName?: string;

  @Column({ name: 'specialty', nullable: true })
  specialty?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;
}
