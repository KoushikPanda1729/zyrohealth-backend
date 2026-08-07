import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum SalePaymentMode {
  CASH = 'cash',
  UPI = 'upi',
  CARD = 'card',
  CREDIT = 'credit',
}

export interface SaleLineItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  priceCentsPerUnit: number;
  gstRatePercent: number;
  lineSubtotalCents: number;
  lineGstCents: number;
  lineTotalCents: number;
  isControlledDrug?: boolean;
}

// India's Schedule H1 requires recording who a controlled drug was
// dispensed to and on whose prescription — captured once per sale (a
// single prescription/customer visit), not per line item, since that's
// how a real pharmacy register works.
export interface ControlledDrugInfo {
  patientName: string;
  patientAddress?: string;
  doctorName: string;
  doctorRegNo: string;
}

// A counter/point-of-sale transaction — distinct from MedicineOrder
// (which comes from the patient-upload prescription marketplace flow).
// This is "a walk-in customer bought X at the counter," the foundation
// GST invoicing, the customer credit ledger, and cash reconciliation are
// all built on top of (see billing.util.ts).
@Entity('medicine_shop_sales')
export class MedicineShopSale extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  // Sequential per shop (see billing.util.ts) — required for a GST
  // invoice to be legally sequential/traceable, unlike the UUID primary key.
  @Column({ name: 'invoice_number' })
  invoiceNumber!: number;

  @Column({ name: 'customer_id', type: 'varchar', nullable: true })
  customerId?: string | null;

  // Kept even if the customer record is later renamed/removed, so a past
  // invoice's printed name never silently changes.
  @Column({ name: 'customer_name_snapshot', type: 'varchar', nullable: true })
  customerNameSnapshot?: string | null;

  @Column({ type: 'jsonb' })
  items!: SaleLineItem[];

  @Column({ name: 'subtotal_cents' })
  subtotalCents!: number;

  @Column({ name: 'gst_cents' })
  gstCents!: number;

  @Column({ name: 'total_cents' })
  totalCents!: number;

  @Column({ name: 'payment_mode', type: 'enum', enum: SalePaymentMode })
  paymentMode!: SalePaymentMode;

  // Equal to totalCents for cash/UPI/card; may be less than totalCents for
  // a credit sale (the shortfall becomes the customer's due — see
  // MedicineShopCustomerLedgerEntry).
  @Column({ name: 'amount_paid_cents' })
  amountPaidCents!: number;

  @Column({ name: 'controlled_drug_info', type: 'jsonb', nullable: true })
  controlledDrugInfo?: ControlledDrugInfo | null;

  @Column({ type: 'varchar', nullable: true })
  note?: string | null;
}
