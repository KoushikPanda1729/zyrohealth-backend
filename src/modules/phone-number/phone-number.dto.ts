import { z } from 'zod';

export const ImportInboundDto = z.object({
  label: z.string().min(1).max(100),
  phoneNumber: z.string().min(1),
  provider: z.string().default('twilio'),
  allowedAddresses: z.array(z.string()).optional(),
  mediaEncryption: z
    .enum(['disabled', 'required', 'optional'])
    .default('disabled'),
});

export const ImportOutboundDto = z.object({
  phoneNumberId: z.string().uuid(),
  address: z.string().min(1),
  transport: z.enum(['auto', 'tls', 'tcp', 'udp']).default('auto'),
  mediaEncryption: z
    .enum(['disabled', 'required', 'optional'])
    .default('disabled'),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const AssignAgentDto = z.object({
  agentId: z.string().uuid(),
});

export const InitiateCallDto = z.object({
  toNumber: z.string().min(1),
  waitUntilAnswered: z.boolean().default(true),
  dynamicVariables: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

export type ImportInboundDtoType = z.infer<typeof ImportInboundDto>;
export type ImportOutboundDtoType = z.infer<typeof ImportOutboundDto>;
export type AssignAgentDtoType = z.infer<typeof AssignAgentDto>;
export type InitiateCallDtoType = z.infer<typeof InitiateCallDto>;
