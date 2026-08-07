import { z } from 'zod';

export const CreateAiSessionDto = z.object({});

export const SendAiMessageDto = z.object({
  message: z.string().min(1, 'Message is required'),
});

export type SendAiMessageDtoType = z.infer<typeof SendAiMessageDto>;
