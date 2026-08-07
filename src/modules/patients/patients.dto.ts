import { z } from 'zod';

export const CreatePatientProfileDto = z.object({
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  allergies: z.array(z.string()).default([]),
  chronicConditions: z.array(z.string()).default([]),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

export const UpdatePatientProfileDto = CreatePatientProfileDto.partial();

export type CreatePatientProfileDtoType = z.infer<
  typeof CreatePatientProfileDto
>;
export type UpdatePatientProfileDtoType = z.infer<
  typeof UpdatePatientProfileDto
>;
