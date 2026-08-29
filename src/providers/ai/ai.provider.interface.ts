export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface HistoryEntry {
  entryType: string;
  summary: string;
  detectedSymptoms: string[];
  createdAt: string;
}

export interface PatientContext {
  bloodGroup: string;
  allergies: string[];
  chronicConditions: string[];
  history: HistoryEntry[];
}

export interface AiChatParams {
  messages: Message[];
  systemPrompt: string;
  patientContext: PatientContext;
  sessionId: string;
  imageBase64?: string;
  imageMimeType?: string;
  /** Additional images attached to the last user message, alongside (or
   * instead of) imageBase64/imageMimeType — e.g. several photos of the
   * same medicine box from different angles. */
  images?: { base64: string; mimeType: string }[];
}

export interface AiStructuredResult {
  detectedSymptoms: string[];
  severityScore: number;
  suggestedSpecialty: string;
  referToDoctor: boolean;
  reasoning: string;
}

export interface AiChatResult {
  reply: string;
  structured: AiStructuredResult;
  imageUrl?: string;
}

export interface PrescriptionImageCheck {
  isPrescription: boolean;
  // Shown to the patient verbatim when isPrescription is false — kept
  // short and actionable (e.g. "This looks like a selfie, not a
  // prescription.") rather than a raw model explanation.
  reason: string;
}

export interface IAiProvider {
  chat(params: AiChatParams): Promise<AiChatResult>;
  extractStructuredData(
    conversation: Message[],
    patientContext: PatientContext,
  ): Promise<AiStructuredResult>;
  classifyPrescriptionImage(imageUrl: string): Promise<PrescriptionImageCheck>;
}
