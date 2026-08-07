import { z } from 'zod';

export const CreateAgentDto = z.object({
  displayName: z.string().min(1).max(100),
});

export const UpdateDraftDto = z.object({
  prompt: z.string().optional(),
  welcomeMessage: z.string().optional(),
  welcomeAllowInterruptions: z.boolean().optional(),
  allowInterruptions: z.boolean().optional(),
  minInterruptionDuration: z.number().min(0.1).max(2.0).optional(),
  minInterruptionWords: z.number().int().min(1).max(5).optional(),
  language: z.string().optional(),
  llmProvider: z.string().optional(),
  llmModel: z.string().optional(),
  llmTemperature: z.number().min(0).max(2).optional(),
  sttProvider: z.string().optional(),
  sttModel: z.string().optional(),
  ttsProvider: z.string().optional(),
  ttsModel: z.string().optional(),
  ttsVoiceId: z.string().optional(),
  ttsLanguage: z.string().optional(),
  ttsVoiceSettings: z.record(z.string(), z.unknown()).optional(),
  dynamicVariables: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .nullish(),
});

export const OutboundCallDto = z.object({
  toNumber: z.string().min(1),
  dynamicVariables: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .nullish(),
});

export const PublishAgentDto = z.object({
  sourceVersionId: z.string().uuid().optional(),
});

export type CreateAgentDtoType = z.infer<typeof CreateAgentDto>;
export type UpdateDraftDtoType = z.infer<typeof UpdateDraftDto>;
export type OutboundCallDtoType = z.infer<typeof OutboundCallDto>;
export type PublishAgentDtoType = z.infer<typeof PublishAgentDto>;
