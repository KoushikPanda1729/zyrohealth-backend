import { z } from 'zod';

export const CreateAmbulanceRequestDto = z.object({
  hospitalId: z.string().uuid(),
  pickupAddress: z.string().min(1),
  pickupLatitude: z.number().min(-90).max(90).optional(),
  pickupLongitude: z.number().min(-180).max(180).optional(),
  contactPhone: z.string().min(1),
  notes: z.string().optional(),
});

export type CreateAmbulanceRequestDtoType = z.infer<typeof CreateAmbulanceRequestDto>;

export const CancelAmbulanceRequestDto = z.object({
  reason: z.string().min(1).optional(),
});

export type CancelAmbulanceRequestDtoType = z.infer<typeof CancelAmbulanceRequestDto>;
