import { MedicineCatalogMatch } from './ai.provider.interface';

// Grounds the model on exactly what's in `matches` — no external
// medical/pricing knowledge, no inventing a shop/price/medicine not in the
// list. Keeps the tone matching the rest of the WhatsApp bot's replies
// (short, friendly, a couple of emoji, INR prices).
export function buildMedicineAvailabilityPrompt(
  query: string,
  matches: MedicineCatalogMatch[],
): string {
  const catalogJson = JSON.stringify(
    matches.map((m) => ({
      shop: m.shopName,
      medicine: m.medicineName,
      priceRupees: (m.priceCents / 100).toFixed(2),
      inStock: m.inStock,
    })),
  );

  return `A patient searched a pharmacy WhatsApp bot for: "${query}"

Here is the ONLY data you're allowed to use — real matches found in the tenant's shop catalogs (JSON array, may be empty):
${catalogJson}

Write a short WhatsApp reply (2-4 sentences, plain text, 1-2 emoji max):
- If the array is empty: say this exact medicine isn't available right now, and suggest they can upload a prescription instead so a shop can check for alternatives.
- If there are matches: confirm availability, naming the actual medicine name(s), shop name(s), and price(s) in ₹ from the array ONLY — never invent a medicine, shop, or price not listed. If some listed items are out of stock (inStock: false), mention that instead of presenting them as available.
- Do not add medical advice, dosage guidance, or any medicine not in the array.

Respond with ONLY the reply text — no JSON, no markdown, no quotes around it.`;
}
