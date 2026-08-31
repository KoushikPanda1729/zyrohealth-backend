import { injectable, inject } from 'tsyringe';
import Anthropic from '@anthropic-ai/sdk';
import {
  IAiProvider,
  AiChatParams,
  AiChatResult,
  AiStructuredResult,
  Message,
  PatientContext,
  PrescriptionImageCheck,
  MedicineCatalogMatch,
} from './ai.provider.interface';
import { IStorageProvider } from '../storage/storage.provider.interface';
import { env } from '../../config/env';
import { STORAGE_PROVIDER } from '../../config/di-tokens';
import { AppError } from '../../utils/app-error';
import { PRESCRIPTION_CLASSIFY_PROMPT, parsePrescriptionCheck } from './prescription-classify.util';
import { buildMedicineAvailabilityPrompt } from './medicine-availability.util';

@injectable()
export class ClaudeAiProvider implements IAiProvider {
  private readonly client: Anthropic;
  private readonly maxRetries = 2;

  constructor(@inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider) {
    this.client = new Anthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
    });
  }

  async chat(params: AiChatParams): Promise<AiChatResult> {
    const { messages, systemPrompt } = params;

    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const reply = await this.callWithRetry(async () => {
      const response = await this.client.messages.create({
        model: env.AI_MODEL,
        max_tokens: env.AI_MAX_TOKENS,
        system: systemPrompt,
        messages: anthropicMessages,
      });
      const block = response.content[0];
      if (block.type !== 'text')
        throw AppError.unprocessable('Unexpected AI response type');
      return block.text;
    });

    const structured = await this.extractStructuredData(
      messages,
      params.patientContext,
    );
    return { reply, structured };
  }

  async extractStructuredData(
    conversation: Message[],
    patientContext: PatientContext,
  ): Promise<AiStructuredResult> {
    const extractionPrompt = `Based on the following medical conversation, extract structured triage data.

Patient Context:
- Allergies: ${patientContext.allergies.join(', ') || 'None'}
- Chronic Conditions: ${patientContext.chronicConditions.join(', ') || 'None'}

Conversation:
${conversation.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

Respond ONLY with valid JSON matching this exact schema:
{
  "detectedSymptoms": ["symptom1", "symptom2"],
  "severityScore": <integer 1-10>,
  "suggestedSpecialty": "<medical specialty>",
  "referToDoctor": <true|false>,
  "reasoning": "<brief reasoning>"
}`;

    const result = await this.callWithRetry(async () => {
      const response = await this.client.messages.create({
        model: env.AI_MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: extractionPrompt }],
      });
      const block = response.content[0];
      if (block.type !== 'text')
        throw AppError.unprocessable('Unexpected extraction response');
      return block.text;
    });

    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        detectedSymptoms: Array.isArray(parsed['detectedSymptoms'])
          ? (parsed['detectedSymptoms'] as string[])
          : [],
        severityScore:
          typeof parsed['severityScore'] === 'number'
            ? Math.min(10, Math.max(1, Math.round(parsed['severityScore'])))
            : 1,
        suggestedSpecialty:
          typeof parsed['suggestedSpecialty'] === 'string'
            ? parsed['suggestedSpecialty']
            : 'General Practice',
        referToDoctor:
          typeof parsed['referToDoctor'] === 'boolean'
            ? parsed['referToDoctor']
            : false,
        reasoning:
          typeof parsed['reasoning'] === 'string' ? parsed['reasoning'] : '',
      };
    } catch {
      return {
        detectedSymptoms: [],
        severityScore: 1,
        suggestedSpecialty: 'General Practice',
        referToDoctor: false,
        reasoning: 'Could not extract structured data',
      };
    }
  }

  async classifyPrescriptionImage(imageUrl: string): Promise<PrescriptionImageCheck> {
    // Uploaded media lands in a private bucket — a plain https:// URL to it
    // 403s, so a short-lived signed URL is needed to actually fetch it.
    const key = decodeURIComponent(new URL(imageUrl).pathname.replace(/^\//, ''));
    const signedUrl = await this.storage.getSignedUrl(key, 300);
    const res = await fetch(signedUrl);
    if (!res.ok) throw AppError.unprocessable('Could not fetch the uploaded image');
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');

    const result = await this.callWithRetry(async () => {
      const response = await this.client.messages.create({
        model: env.AI_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType as 'image/jpeg', data: base64 },
              },
              {
                type: 'text',
                text: PRESCRIPTION_CLASSIFY_PROMPT,
              },
            ],
          },
        ],
      });
      const block = response.content[0];
      if (block.type !== 'text')
        throw AppError.unprocessable('Unexpected AI response type');
      return block.text;
    });

    return parsePrescriptionCheck(result);
  }

  async answerMedicineAvailabilityQuery(
    query: string,
    matches: MedicineCatalogMatch[],
  ): Promise<string> {
    const result = await this.callWithRetry(async () => {
      const response = await this.client.messages.create({
        model: env.AI_MODEL,
        max_tokens: 250,
        messages: [{ role: 'user', content: buildMedicineAvailabilityPrompt(query, matches) }],
      });
      const block = response.content[0];
      if (block.type !== 'text')
        throw AppError.unprocessable('Unexpected AI response type');
      return block.text;
    });
    return result.trim();
  }

  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (attempt + 1)),
          );
        }
      }
    }
    throw AppError.unprocessable(
      `AI provider failed after ${this.maxRetries + 1} attempts: ${String(lastError)}`,
    );
  }
}
