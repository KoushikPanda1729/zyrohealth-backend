import { z } from 'zod';

export const UpdateDoctorProfileDto = z.object({
  specialty: z.string().optional(),
  licenseNumber: z.string().optional(),
  yearsOfExperience: z.number().int().positive().optional(),
  languages: z.array(z.string()).optional(),
  consultationFee: z.number().positive().optional(),
  bio: z.string().optional(),
  qualifications: z.array(z.string()).optional(),
});

export const CreateMedicineDto = z.object({
  name: z.string().min(1),
  genericName: z.string().optional(),
  category: z.string().optional(),
  defaultDosage: z.string().optional(),
  defaultFrequency: z.string().optional(),
  defaultDuration: z.string().optional(),
  defaultRoute: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateMedicineDto = CreateMedicineDto.partial();

export const CreateTestDto = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  defaultInstructions: z.string().optional(),
});

export const UpdateTestDto = CreateTestDto.partial();

export const CreateAvailabilityDto = z.object({
  dayOfWeek: z.enum([
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMinutes: z.number().int().positive().default(30),
});

export const UpdateAvailabilityDto = CreateAvailabilityDto.partial();

export const ListDoctorsDto = z.object({
  specialty: z.string().optional(),
  language: z.string().optional(),
  minRating: z.string().transform(Number).optional(),
  maxFee: z.string().transform(Number).optional(),
  page: z
    .preprocess((v) => (v === undefined ? 1 : Number(v)), z.number())
    .default(1),
  limit: z
    .preprocess((v) => (v === undefined ? 20 : Number(v)), z.number())
    .default(20),
});

export type UpdateDoctorProfileDtoType = z.infer<typeof UpdateDoctorProfileDto>;
export type CreateMedicineDtoType = z.infer<typeof CreateMedicineDto>;
export type UpdateMedicineDtoType = z.infer<typeof UpdateMedicineDto>;
export type CreateTestDtoType = z.infer<typeof CreateTestDto>;
export type UpdateTestDtoType = z.infer<typeof UpdateTestDto>;
export type CreateAvailabilityDtoType = z.infer<typeof CreateAvailabilityDto>;
export type UpdateAvailabilityDtoType = z.infer<typeof UpdateAvailabilityDto>;
