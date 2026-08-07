import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum VoiceAgentCallType {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum VoiceAgentCallStatus {
  INITIATED = 'initiated',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('voice_agent_calls')
export class VoiceAgentCall extends BaseEntity {
  @Column({ name: 'agent_id' })
  @Index()
  agentId!: string;

  @Column({ name: 'doctor_id' })
  @Index()
  doctorId!: string;

  @Column({ name: 'room_name' })
  roomName!: string;

  @Column({ name: 'call_type', type: 'enum', enum: VoiceAgentCallType })
  callType!: VoiceAgentCallType;

  @Column({ name: 'from_number', nullable: true })
  fromNumber?: string;

  @Column({ name: 'to_number', nullable: true })
  toNumber?: string;

  @Column({
    type: 'enum',
    enum: VoiceAgentCallStatus,
    default: VoiceAgentCallStatus.INITIATED,
  })
  status!: VoiceAgentCallStatus;

  @Column({ type: 'jsonb', nullable: true })
  transcript?: unknown;

  @Column({ name: 'recording_url', nullable: true })
  recordingUrl?: string;

  @Column({ name: 'duration_seconds', nullable: true })
  durationSeconds?: number;

  @Column({ nullable: true })
  summary?: string;

  @Column({ name: 'raw_json', type: 'jsonb', nullable: true })
  rawJson?: unknown;

  @Column({ name: 'booking_created', default: false })
  bookingCreated!: boolean;

  @Column({ name: 'booking_id', nullable: true })
  bookingId?: string;
}
