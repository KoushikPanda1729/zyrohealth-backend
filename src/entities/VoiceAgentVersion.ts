import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum VoiceAgentVersionSource {
  PUBLISH = 'publish',
  ROLLBACK = 'rollback',
}

@Entity('voice_agent_versions')
export class VoiceAgentVersion extends BaseEntity {
  @Column({ name: 'agent_id' })
  @Index()
  agentId!: string;

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'text', nullable: true })
  prompt?: string;

  @Column({ name: 'welcome_message', nullable: true })
  welcomeMessage?: string;

  @Column({ name: 'welcome_allow_interruptions', default: true })
  welcomeAllowInterruptions!: boolean;

  @Column({ name: 'allow_interruptions', default: true })
  allowInterruptions!: boolean;

  @Column({
    name: 'min_interruption_duration',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 0.5,
  })
  minInterruptionDuration!: number;

  @Column({ name: 'min_interruption_words', type: 'int', default: 2 })
  minInterruptionWords!: number;

  @Column({ default: 'en' })
  language!: string;

  @Column({ name: 'llm_provider', default: 'openai' })
  llmProvider!: string;

  @Column({ name: 'llm_model', default: 'gpt-4o-mini' })
  llmModel!: string;

  @Column({
    name: 'llm_temperature',
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0.7,
  })
  llmTemperature!: number;

  @Column({ name: 'stt_provider', default: 'deepgram' })
  sttProvider!: string;

  @Column({ name: 'stt_model', default: 'nova-2' })
  sttModel!: string;

  @Column({ name: 'tts_provider', default: 'elevenlabs' })
  ttsProvider!: string;

  @Column({ name: 'tts_model', default: 'eleven_flash_v2_5' })
  ttsModel!: string;

  @Column({ name: 'tts_voice_id', nullable: true })
  ttsVoiceId?: string;

  @Column({ name: 'tts_language', default: 'en' })
  ttsLanguage!: string;

  @Column({ name: 'tts_voice_settings', type: 'jsonb', nullable: true })
  ttsVoiceSettings?: Record<string, unknown>;

  @Column({ name: 'dynamic_variables', type: 'jsonb', nullable: true })
  dynamicVariables?: Record<string, string | number | boolean>;

  @Column({
    type: 'enum',
    enum: VoiceAgentVersionSource,
    default: VoiceAgentVersionSource.PUBLISH,
  })
  source!: VoiceAgentVersionSource;

  @Column({ name: 'deployment_status', nullable: true })
  deploymentStatus?: string;

  @Column({ name: 'published_at', type: 'timestamp', default: () => 'NOW()' })
  publishedAt!: Date;
}
