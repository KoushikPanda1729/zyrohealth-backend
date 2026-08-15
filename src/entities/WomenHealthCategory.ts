import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export interface WomenHealthTip {
  title: string;
  body: string;
}

// A tenant-published women's health category (Periods/Fertility/Pregnancy/
// etc.) — patients browse published categories across every tenant, same
// cross-tenant precedent as articles/hospitals/doctors.
@Entity('women_health_categories')
export class WomenHealthCategory extends BaseEntity {
  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column()
  label!: string;

  @Column()
  icon!: string;

  @Column({ name: 'color_start' })
  colorStart!: string;

  @Column({ name: 'color_end' })
  colorEnd!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  facts!: string[];

  @Column({ type: 'jsonb', default: '[]' })
  tips!: WomenHealthTip[];

  @Column({ name: 'is_published', default: true })
  isPublished!: boolean;
}
