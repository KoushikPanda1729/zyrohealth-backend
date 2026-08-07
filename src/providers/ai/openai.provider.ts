import { injectable } from 'tsyringe';
import OpenAI from 'openai';
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

const IMAGE_REQUEST_REGEX =
  /\b(image|picture|photo|show me|visualize|diagram|illustration|draw|visual|graphic|depict|demonstrate visually|yoga pose|exercise|anatomy|anatomy of)\b/i;

@injectable()
export class OpenAiProvider implements IAiProvider {
  private readonly client: OpenAI;
  private readonly maxRetries = 2;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async chat(params: AiChatParams): Promise<AiChatResult> {
    const { messages, systemPrompt, imageBase64, imageMimeType, images } =
      params;

    // All attached images — the single imageBase64/imageMimeType pair (used
    // by the patient symptom-checker) plus any additional `images` (used by
    // the medicine catalog photo scan, which may send several angles of
    // the same package in one request).
    const allImages = [
      ...(imageBase64 && imageMimeType
        ? [{ base64: imageBase64, mimeType: imageMimeType }]
        : []),
      ...(images ?? []),
    ];

    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const wantsImage =
      allImages.length === 0 && IMAGE_REQUEST_REGEX.test(lastUserMessage);

    // Build message list — last user message gets vision content if any images are attached
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    const priorMessages = messages.slice(0, -1);
    for (const m of priorMessages) {
      openaiMessages.push({
        role: m.role,
        content: m.content,
      });
    }

    // Last user message — attach image(s) if present
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && allImages.length > 0) {
      openaiMessages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: lastMsg.content || 'Please analyze this image.',
          },
          ...allImages.map((img) => ({
            type: 'image_url' as const,
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64}`,
              detail: 'high' as const,
            },
          })),
        ],
      });
    } else if (lastMsg) {
      openaiMessages.push({ role: lastMsg.role, content: lastMsg.content });
    }

    // Run text reply and (optionally) image generation in parallel
    const [reply, imageUrl] = await Promise.all([
      this.callWithRetry(async () => {
        const response = await this.client.chat.completions.create({
          model: env.AI_MODEL,
          max_tokens: env.AI_MAX_TOKENS,
          messages: openaiMessages,
        });
        const content = response.choices[0]?.message?.content;
        if (!content) throw AppError.unprocessable('Empty AI response');
        return content;
      }),
      wantsImage
        ? this.generateImage(lastUserMessage)
        : Promise.resolve(undefined),
    ]);

    const structured = await this.extractStructuredData(
      messages,
      params.patientContext,
    );
    return { reply, structured, imageUrl };
  }

  async generateImage(userMessage: string): Promise<string | undefined> {
    try {
      const prompt =
        `Health and medical educational illustration for a telemedicine app: ${userMessage}. ` +
        `Clean, professional, informative style. No text overlays. Safe for all ages.`;
      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      });
      return response.data?.[0]?.url ?? undefined;
    } catch (err) {
      console.error('[DALL-E] Image generation failed:', err);
      return undefined;
    }
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
      const response = await this.client.chat.completions.create({
        model: env.AI_MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: extractionPrompt }],
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw AppError.unprocessable('Empty extraction response');
      return content;
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
