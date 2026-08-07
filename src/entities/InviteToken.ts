import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// One-time "set your password" link for staff/tenant-admin accounts
// created without a password up front (admin.service.ts inviteStaff,
// platform.service.ts createTenantAdmin). The raw token is only ever
// visible once, to whoever created the invite — only its hash is stored.
@Entity('invite_tokens')
export class InviteToken extends BaseEntity {
  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  @Column({ name: 'token_hash', unique: true })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt?: Date;
}
