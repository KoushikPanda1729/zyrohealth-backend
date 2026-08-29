import { injectable } from 'tsyringe';
import {
  IAiProvider,
  AiChatParams,
  AiChatResult,
  AiStructuredResult,
  Message,
  PatientContext,
  PrescriptionImageCheck,
} from './ai.provider.interface';

// TODO: Implement Gemini provider
@injectable()
export class GeminiAiProvider implements IAiProvider {
  chat(_params: AiChatParams): Promise<AiChatResult> {
    throw new Error('GeminiAiProvider not implemented');
  }

  extractStructuredData(
    _conversation: Message[],
    _patientContext: PatientContext,
  ): Promise<AiStructuredResult> {
    throw new Error('GeminiAiProvider not implemented');
  }

  classifyPrescriptionImage(_imageUrl: string): Promise<PrescriptionImageCheck> {
    throw new Error('GeminiAiProvider not implemented');
  }
}
