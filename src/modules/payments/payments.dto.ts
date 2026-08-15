import { z } from 'zod';

export const InitiatePaymentDto = z.object({
  bookingId: z.string().uuid(),
  currency: z.string().default('usd'),
  // 'app' redirects the Stripe Checkout success/cancel URLs to the mobile
  // app's custom URL scheme instead of the web frontend — a browser on a
  // phone can't reach FRONTEND_URL's localhost/LAN address at all.
  platform: z.enum(['web', 'app']).default('web'),
});

export type InitiatePaymentDtoType = z.infer<typeof InitiatePaymentDto>;
