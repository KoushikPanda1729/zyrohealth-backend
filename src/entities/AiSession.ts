import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';
import { AiDoctor } from './AiDoctor';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  imageUrl?: string;
}

@Entity('ai_sessions')
export class AiSession extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'jsonb', default: '[]' })
  messages!: AiMessage[];

  @Column({
    name: 'detected_symptoms',
    type: 'text',
    array: true,
    default: '{}',
  })
  detectedSymptoms!: string[];

  @Column({ name: 'severity_score', type: 'int', nullable: true })
  severityScore?: number;

  @Column({ name: 'suggested_specialty', nullable: true })
  suggestedSpecialty?: string;

  @Column({ name: 'refer_to_doctor', default: false })
  referToDoctor!: boolean;

  @Column({ name: 'is_closed', default: false })
  isClosed!: boolean;

  @Column({ name: 'ai_summary', type: 'text', nullable: true })
  aiSummary?: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @Column({ nullable: true })
  title?: string;

  @Column({ name: 'ai_doctor_id', nullable: true })
  aiDoctorId?: string;

  @ManyToOne(() => AiDoctor, { nullable: true })
  @JoinColumn({ name: 'ai_doctor_id' })
  aiDoctor?: AiDoctor;
}
