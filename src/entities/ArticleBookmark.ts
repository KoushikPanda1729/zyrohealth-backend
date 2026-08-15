import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A patient's own saved article — purely patient-scoped (no tenant/admin
// permission gating), same precedent as a patient's own cart/orders.
@Entity('article_bookmarks')
@Unique(['patientId', 'articleId'])
export class ArticleBookmark extends BaseEntity {
  @Column({ name: 'patient_id' })
  @Index()
  patientId!: string;

  @Column({ name: 'article_id' })
  @Index()
  articleId!: string;
}
