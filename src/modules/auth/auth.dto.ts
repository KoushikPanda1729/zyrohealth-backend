import { z } from 'zod';

export const SendOtpDto = z.object({
  phone: z
    .string()
    .min(10)
    .regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number'),
  channel: z.enum(['sms', 'whatsapp']).optional().default('sms'),
});

export const VerifyOtpDto = z.object({
  phone: z
    .string()
    .min(10)
    .regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number'),
  code: z.string().length(6, 'OTP must be 6 digits'),
  role: z.enum(['patient', 'doctor']).optional().default('patient'),
  tenantId: z.string().uuid().optional(),
});

export type SendOtpDtoType = z.infer<typeof SendOtpDto>;
export type VerifyOtpDtoType = z.infer<typeof VerifyOtpDto>;
