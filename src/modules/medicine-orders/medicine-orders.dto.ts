import { z } from 'zod';

const OrderItemSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().optional(),
  quantity: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
  // Present for a direct pharmacy purchase (see pharmacy.routes.ts) — the
  // server always re-derives the real price/stock from this catalogue
  // item rather than trusting unitPriceCents above, which only matters
  // for the existing prescription-quote flow that never sets this.
  catalogItemId: z.string().uuid().optional(),
});

export const CreateOrderDto = z.object({
  prescriptionId: z.string().uuid().optional(),
  // Which pharmacy fulfills this order — required for a direct catalogue
  // purchase, left unset by the WhatsApp prescription-quote flow (that
  // path already knows its shop from the accepted quote, not the DTO).
  shopId: z.string().uuid().optional(),
  items: z.array(OrderItemSchema).min(1),
  deliveryAddressLine1: z.string().min(1),
  deliveryAddressLine2: z.string().optional(),
  deliveryCity: z.string().min(1),
  deliveryState: z.string().min(1),
  deliveryPincode: z.string().min(1),
  deliveryPhone: z.string().min(1),
});

export type CreateOrderDtoType = z.infer<typeof CreateOrderDto>;

export const CancelOrderDto = z.object({
  reason: z.string().min(1).optional(),
});

export type CancelOrderDtoType = z.infer<typeof CancelOrderDto>;

export const InitiateMedicineOrderPaymentDto = z.object({
  platform: z.enum(['web', 'app']).default('web'),
});

export type InitiateMedicineOrderPaymentDtoType = z.infer<
  typeof InitiateMedicineOrderPaymentDto
>;

// A cart spanning several pharmacies creates one order per shop client-side,
// then pays for all of them together in one checkout — see
// MedicineOrderPaymentsService.createCheckoutForOrderGroup.
export const InitiateGroupPaymentDto = z.object({
  orderIds: z.array(z.string().uuid()).min(1),
  platform: z.enum(['web', 'app']).default('web'),
});

export type InitiateGroupPaymentDtoType = z.infer<typeof InitiateGroupPaymentDto>;
