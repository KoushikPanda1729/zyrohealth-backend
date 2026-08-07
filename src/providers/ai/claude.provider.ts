import { injectable } from 'tsyringe';
import Anthropic from '@anthropic-ai/sdk';
import {
  IAiProvider,
  AiChatParams,
  AiChatResult,
  AiStructuredResult,
  Message,
  PatientContext,
} from './ai.provider.interface';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';

@injectable()
export class ClaudeAiProvider implements IAiProvider {
  private readonly client: Anthropic;
  private readonly maxRetries = 2;

  constructor() {
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
