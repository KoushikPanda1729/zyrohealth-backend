import { Entity, Column } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A global Home screen promo banner, owned by the platform (same scope as
// PlatformAppConfig — managed on the App Config page, not per-tenant).
// Multiple banners form the mobile app's auto-advancing/swipeable carousel,
// ordered by sortOrder.
@Entity('banners')
export class Banner extends BaseEntity {
  @Column()
  title!: string;

  @Column({ name: 'image_url', nullable: true })
  imageUrl?: string;

  @Column({ name: 'cta_text', default: 'Learn more' })
  ctaText!: string;

  // Either an in-app route (starts with "/") or an external URL (starts
  // with "http") — the mobile app decides how to open it based on prefix.
  @Column({ name: 'cta_link', nullable: true })
  ctaLink?: string;

  @Column({ name: 'background_color', default: '#DBEFED' })
  backgroundColor!: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_published', default: true })
  isPublished!: boolean;
}
