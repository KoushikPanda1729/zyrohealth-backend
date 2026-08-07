import { z } from 'zod';

export const SendMessageDto = z.object({
  type: z.enum(['text', 'prescription', 'image', 'file']).default('text'),
  content: z.string().min(1),
  fileUrl: z.string().url().optional(),
});

export const SocketSendMessageSchema = z.object({
  bookingId: z.string().uuid(),
  type: z.enum(['text', 'prescription', 'image', 'file']).default('text'),
  content: z.string().min(1),
  fileUrl: z.string().url().optional(),
});

export const SocketJoinRoomSchema = z.object({
  bookingId: z.string().uuid(),
});

export type SendMessageDtoType = z.infer<typeof SendMessageDto>;
