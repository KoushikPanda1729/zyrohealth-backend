import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

@Entity('voice_agents')
export class VoiceAgent extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'doctor_id' })
  @Index()
  doctorId!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ name: 'display_name' })
  displayName!: string;

  @Column({ default: true })
  active!: boolean;

  @Column({ name: 'external_id', nullable: true })
  externalId?: string;

  @Column({ name: 'deployed_version_id', nullable: true })
  deployedVersionId?: string;
}
