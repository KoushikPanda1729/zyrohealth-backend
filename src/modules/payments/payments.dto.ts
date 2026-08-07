import { z } from 'zod';

export const InitiatePaymentDto = z.object({
  bookingId: z.string().uuid(),
  currency: z.string().default('usd'),
});

export type InitiatePaymentDtoType = z.infer<typeof InitiatePaymentDto>;
