import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A tenant-published health article — patients browse published articles
// across every tenant (see modules/articles's public routes, same
// cross-tenant precedent as doctors/hospitals/pharmacy).
@Entity('articles')
export class Article extends BaseEntity {
  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'image_url', nullable: true })
  imageUrl?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ name: 'author_name', nullable: true })
  authorName?: string;

  @Column({ name: 'read_time_minutes', default: 3 })
  readTimeMinutes!: number;

  @Column({ name: 'is_published', default: true })
  isPublished!: boolean;
}
