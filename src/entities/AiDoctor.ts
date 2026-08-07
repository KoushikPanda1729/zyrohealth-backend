import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';

@Entity('ai_doctors')
export class AiDoctor extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  specialty?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'avatar_url', nullable: true })
  avatarUrl?: string;

  @Column({ name: 'system_prompt', type: 'text' })
  systemPrompt!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by' })
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator!: User;
}
