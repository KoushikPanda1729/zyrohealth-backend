import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum MedicineShopQuoteStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  DECLINED = 'declined',
}

export enum QuoteSubmissionChannel {
  PORTAL = 'portal',
  WHATSAPP = 'whatsapp',
  MANUAL = 'manual',
}

export interface QuotedMedicineItem {
  name: string;
  quantity?: number;
  priceCents?: number;
}

// One row per (PrescriptionUploadRequest, MedicineShop) pair created at
// dispatch time — starts `pending`, becomes `submitted` once the shop
// responds (via their portal, a WhatsApp reply, or staff manually entering
// a phoned-in price on the shop's behalf).
@Entity('medicine_shop_quotes')
export class MedicineShopQuote extends BaseEntity {
  @Column({ name: 'request_id' })
  @Index()
  requestId!: string;

  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({
    type: 'enum',
    enum: MedicineShopQuoteStatus,
    default: MedicineShopQuoteStatus.PENDING,
  })
  status!: MedicineShopQuoteStatus;

  @Column({ type: 'jsonb', nullable: true })
  items?: QuotedMedicineItem[];

  @Column({ name: 'total_cents', type: 'int', nullable: true })
  totalCents?: number;

  @Column({ nullable: true })
  note?: string;

  @Column({
    name: 'submitted_via',
    type: 'enum',
    enum: QuoteSubmissionChannel,
    nullable: true,
  })
  submittedVia?: QuoteSubmissionChannel;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date;
}
