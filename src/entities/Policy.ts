import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A platform-owned legal/policy document — privacy policy, refund policy,
// terms of service, etc. Global, same scope as Banner/PlatformAppConfig
// (managed on the Policies admin page, not per-tenant). Slug is the
// stable public identifier: health-frontend's /policies/[slug] page (and
// /privacy, which reads the 'privacy-policy' slug) fetch by it via
// modules/policies's public router.
@Entity('policies')
export class Policy extends BaseEntity {
  @Column({ unique: true })
  @Index()
  slug!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', default: '' })
  content!: string;

  @Column({ name: 'is_published', default: true })
  isPublished!: boolean;
}
