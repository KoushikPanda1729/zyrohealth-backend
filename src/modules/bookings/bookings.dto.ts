import { z } from 'zod';

export const CreateBookingDto = z.object({
  doctorId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  aiSessionId: z.string().uuid().optional(),
  consultationType: z.enum(['video', 'offline']).default('video'),
});

export const CancelBookingDto = z.object({
  reason: z.string().min(1).optional(),
});

export type CreateBookingDtoType = z.infer<typeof CreateBookingDto>;
export type CancelBookingDtoType = z.infer<typeof CancelBookingDto>;
