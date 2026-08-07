import { z } from 'zod';

// Optional fields are `.nullable()` too because these often come straight from
// nullable catalogue columns (MedicineCatalogue/TestCatalogue) on the client,
// which surface as `null` in JSON, not `undefined`.
const MedicineSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().nullable().optional(),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  duration: z.string().min(1),
  route: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const TestSchema = z.object({
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
});

export const CreatePrescriptionDto = z.object({
  bookingId: z.string().uuid(),
  diagnosis: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  medicines: z.array(MedicineSchema).min(1),
  tests: z.array(TestSchema).default([]),
  confirmedAllergyOverride: z.boolean().default(false),
});

export type CreatePrescriptionDtoType = z.infer<typeof CreatePrescriptionDto>;
