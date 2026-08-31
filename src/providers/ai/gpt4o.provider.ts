import { injectable } from 'tsyringe';
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

// TODO: Implement GPT-4o provider
@injectable()
export class Gpt4oAiProvider implements IAiProvider {
  chat(_params: AiChatParams): Promise<AiChatResult> {
    throw new Error('Gpt4oAiProvider not implemented');
  }

  extractStructuredData(
    _conversation: Message[],
    _patientContext: PatientContext,
  ): Promise<AiStructuredResult> {
    throw new Error('Gpt4oAiProvider not implemented');
  }

  classifyPrescriptionImage(_imageUrl: string): Promise<PrescriptionImageCheck> {
    throw new Error('Gpt4oAiProvider not implemented');
  }

  answerMedicineAvailabilityQuery(
    _query: string,
    _matches: MedicineCatalogMatch[],
  ): Promise<string> {
    throw new Error('Gpt4oAiProvider not implemented');
  }
}
