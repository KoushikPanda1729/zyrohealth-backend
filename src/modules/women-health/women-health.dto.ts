import { z } from 'zod';

export const UpsertCycleLogDto = z.object({
  cycleLengthDays: z.number().int().min(15).max(60).optional(),
  periodLengthDays: z.number().int().min(1).max(15).optional(),
  lastPeriodStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});

export type UpsertCycleLogDtoType = z.infer<typeof UpsertCycleLogDto>;
