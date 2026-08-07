import { z } from 'zod';

const OrderItemSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().optional(),
  quantity: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
});

export const CreateOrderDto = z.object({
  prescriptionId: z.string().uuid().optional(),
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
