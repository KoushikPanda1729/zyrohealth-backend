import { PrescriptionImageCheck } from './ai.provider.interface';

export const PRESCRIPTION_CLASSIFY_PROMPT = `You are checking a photo a patient uploaded through a pharmacy app's "upload prescription" step.

Look at the image and decide if it's genuinely a medical prescription — a doctor's handwritten or printed note listing medicines/dosages, a hospital/clinic prescription pad, or a pharmacy-printed prescription. Random photos (selfies, screenshots of chats, unrelated documents, blurry/unreadable images, medicine boxes without a prescription, memes, etc.) are NOT prescriptions.

Respond ONLY with valid JSON matching this exact schema, nothing else:
{
  "isPrescription": <true|false>,
  "reason": "<one short sentence, shown directly to the patient if false, e.g. \\"This looks like a selfie, not a prescription.\\" — keep it under 15 words, friendly, no medical jargon>"
}`;

export function parsePrescriptionCheck(raw: string): PrescriptionImageCheck {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      isPrescription: parsed['isPrescription'] === true,
      reason:
        typeof parsed['reason'] === 'string' && parsed['reason']
          ? parsed['reason']
          : "This doesn't look like a prescription — please send a clear photo of your prescription.",
    };
  } catch {
    // Fail open — if the model response can't be parsed, don't block a
    // genuine prescription upload over an AI hiccup.
    return { isPrescription: true, reason: '' };
  }
}
