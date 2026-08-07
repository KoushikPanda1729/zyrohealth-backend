import { Entity, Column } from 'typeorm';
import { BaseEntity } from './BaseEntity';

@Entity('voice_agent_phone_numbers')
export class VoiceAgentPhoneNumber extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'phone_number', unique: true })
  phoneNumber!: string;

  @Column({ nullable: true })
  label?: string;

  @Column({ nullable: true })
  provider?: string;

  @Column({ name: 'assigned_doctor_id', nullable: true })
  assignedDoctorId?: string;

  @Column({ name: 'inbound_trunk_id', nullable: true })
  inboundTrunkId?: string;

  @Column({ name: 'outbound_trunk_id', nullable: true })
  outboundTrunkId?: string;

  @Column({ name: 'inbound_dispatch_rule_id', nullable: true })
  inboundDispatchRuleId?: string;

  @Column({ name: 'assigned_agent_id', nullable: true })
  assignedAgentId?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
