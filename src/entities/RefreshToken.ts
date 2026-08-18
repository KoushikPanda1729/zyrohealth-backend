import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';

@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'token_hash' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  // Set only for a tenant admin's "Open Full View" into their OWN in-house
  // shop (see AdminService.impersonateShop) — the token issued is for the
  // admin's OWN User row (so their identity/email stays truthfully theirs),
  // with this extra claim granting shop-portal access for that one shop.
  // Persisted here (not just signed into the JWT) so a token refresh can
  // re-embed it — otherwise the shop tab would silently lose shop access
  // every time its 1-hour access token expires.
  @Column({ type: 'varchar', name: 'acting_shop_id', nullable: true })
  actingShopId?: string | null;
}
