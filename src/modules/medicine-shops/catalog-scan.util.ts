import { IAiProvider } from '../../providers/ai/ai.provider.interface';
import { AppError } from '../../utils/app-error';

export interface ScannedMedicineFields {
  name?: string;
  manufacturer?: string;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD if legible
  priceCents?: number; // from a printed MRP, if legible
  unit?: string; // e.g. "tablet", "capsule", "ml", "bottle" — read off the pack
  packSize?: number; // e.g. 32 (from "32 TABLETS") — count PER PACK, not current stock on hand
}

const SCAN_SYSTEM_PROMPT =
  'You are an expert at reading medicine package/label/strip photos for pharmacy inventory data entry. ' +
  'Extract only what is clearly legible in the image. Never guess or invent a value you cannot actually read.';

// Reuses the existing `IAiProvider.chat` vision path — now extended to
// accept several images in one call (see ai.provider.interface.ts's
// `images` field / openai.provider.ts) rather than adding a second AI
// integration. A single photo often only shows part of what's printed on a
// box — front face has the name/strength, back/side has batch/expiry/MRP —
// so a shop can attach a few photos from different angles and get one
// combined result. The caller (shop.service.ts) is responsible for a human
// reviewing/editing these fields before they're saved — this never writes
// to the catalog directly, same "AI drafts, human confirms" pattern used
// for doctor bio generation elsewhere in this app.
export async function scanMedicineImage(
  ai: IAiProvider,
  images: { base64: string; mimeType: string }[],
): Promise<ScannedMedicineFields> {
  if (images.length === 0) throw AppError.badRequest('No image provided');

  const result = await ai.chat({
    messages: [
      {
        role: 'user',
        content:
          `You are looking at ${images.length > 1 ? `${images.length} photos of the SAME medicine package, taken from different angles/sides` : 'a photo of a medicine package'}. ` +
          'Combine what you can read across all of them into ONE result. Extract: the medicine name (with strength, e.g. ' +
          '"Paracetamol 500mg"), the manufacturer/brand, the batch number, the expiry date (format as YYYY-MM-DD), the printed ' +
          'MRP/price in rupees, the dosage unit/form printed on the pack (e.g. "tablet", "capsule", "ml", "bottle" — singular), ' +
          'and the count PER PACK if printed like "32 TABLETS" or "10 CAPSULES" (this is how many are in ONE box, not how many ' +
          'boxes the shop has in stock — never treat it as a stock-on-hand quantity). Return ONLY a JSON object with keys name, ' +
          'manufacturer, batchNumber, expiryDate, priceRupees, unit, packSize — use null for any field that is not clearly ' +
          'legible in any of the photo(s). No markdown, no explanation, no extra text.',
      },
    ],
    systemPrompt: SCAN_SYSTEM_PROMPT,
    patientContext: {
      bloodGroup: '',
      allergies: [],
      chronicConditions: [],
      history: [],
    },
    sessionId: 'medicine-catalog-scan',
    images,
  });

  const match = result.reply.match(/\{[\s\S]*\}/);
  if (!match) {
    throw AppError.unprocessable(
      'Could not read this photo — try a clearer, well-lit shot of the label.',
    );
  }

  let parsed: {
    name?: string | null;
    manufacturer?: string | null;
    batchNumber?: string | null;
    expiryDate?: string | null;
    priceRupees?: number | string | null;
    unit?: string | null;
    packSize?: number | string | null;
  };
  try {
    parsed = JSON.parse(match[0]) as typeof parsed;
  } catch {
    throw AppError.unprocessable(
      'Could not read this photo — try a clearer, well-lit shot of the label.',
    );
  }

  const priceValue =
    typeof parsed.priceRupees === 'string'
      ? parseFloat(parsed.priceRupees)
      : parsed.priceRupees;
  const packSizeValue =
    typeof parsed.packSize === 'string'
      ? parseInt(parsed.packSize, 10)
      : parsed.packSize;

  return {
    name: parsed.name?.trim() || undefined,
    manufacturer: parsed.manufacturer?.trim() || undefined,
    batchNumber: parsed.batchNumber?.trim() || undefined,
    expiryDate: parsed.expiryDate?.trim() || undefined,
    priceCents:
      priceValue != null && Number.isFinite(priceValue) && priceValue > 0
        ? Math.round(priceValue * 100)
        : undefined,
    unit: parsed.unit?.trim().toLowerCase() || undefined,
    packSize:
      packSizeValue != null &&
      Number.isFinite(packSizeValue) &&
      packSizeValue > 0
        ? packSizeValue
        : undefined,
  };
}
