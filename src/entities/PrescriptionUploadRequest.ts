import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum PrescriptionUploadStatus {
  PENDING_DISPATCH = 'pending_dispatch',
  DISPATCHED = 'dispatched',
  QUOTED = 'quoted',
  // Staff sent every submitted quote to the patient as a WhatsApp list
  // instead of picking one — distinct from SENT_TO_PATIENT (which already
  // has chosenQuoteId set) since here the patient hasn't picked yet.
  AWAITING_PATIENT_CHOICE = 'awaiting_patient_choice',
  SENT_TO_PATIENT = 'sent_to_patient',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

// A patient's uploaded photo of a prescription (via WhatsApp), working its
// way through: staff dispatches it to onboarded MedicineShops for quotes ->
// shops submit MedicineShopQuote rows -> a quote is chosen (manually or by
// auto-mode) and sent to the patient as a priced receipt -> patient
// confirms -> a real MedicineOrder is created from the chosen quote.
@Entity('prescription_upload_requests')
export class PrescriptionUploadRequest extends BaseEntity {
  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ name: 'patient_id' })
  @Index()
  patientId!: string;

  @Column({ name: 'whatsapp_session_id', nullable: true })
  whatsappSessionId?: string;

  @Column({ name: 'image_url' })
  imageUrl!: string;

  @Column({
    type: 'enum',
    enum: PrescriptionUploadStatus,
    default: PrescriptionUploadStatus.PENDING_DISPATCH,
  })
  status!: PrescriptionUploadStatus;

  @Column({ name: 'dispatched_shop_ids', type: 'jsonb', default: '[]' })
  dispatchedShopIds!: string[];

  @Column({ name: 'assigned_to_user_id', nullable: true })
  assignedToUserId?: string;

  @Column({ name: 'chosen_quote_id', nullable: true })
  chosenQuoteId?: string;

  @Column({ name: 'resulting_order_id', nullable: true })
  resultingOrderId?: string;
}
