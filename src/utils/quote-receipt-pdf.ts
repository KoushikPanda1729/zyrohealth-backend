import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';

export interface QuoteReceiptItem {
  name: string;
  quantity?: number;
  priceCents?: number;
}

export interface QuoteReceiptPdfData {
  tenantName: string;
  shopName?: string;
  requestId: string;
  quoteDate?: Date;
  items?: QuoteReceiptItem[];
  totalCents?: number;
  submittedVia?: string;
  status?: string;
}

// Narrow "till receipt" layout (80mm-wide thermal-paper convention) that
// mirrors QuoteReceipt.tsx on the frontend exactly — monospace font,
// dashed section rules, and a scannable QR footer — because this PDF is
// what a shop actually prints and slips into the medicine package, so it
// must be the SAME document a patient/admin sees on screen, not a
// separately-styled invoice. Amounts use "Rs." rather than "₹": pdf-lib's
// StandardFonts only support WinAnsi encoding, which doesn't include the
// Rupee sign — it would throw at encode time, not just render wrong.

const PAGE_WIDTH = 226; // ~80mm
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const dark = rgb(0.17, 0.17, 0.17);
const gray = rgb(0.42, 0.42, 0.42);
const dashColor = rgb(0.66, 0.66, 0.63);

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncateToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = text;
  while (
    truncated.length > 1 &&
    font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function drawDashedLine(
  page: PDFPage,
  y: number,
  thickness = 1,
  dash = 2.5,
  gap = 2,
): void {
  let x = MARGIN;
  while (x < PAGE_WIDTH - MARGIN) {
    const end = Math.min(x + dash, PAGE_WIDTH - MARGIN);
    page.drawLine({
      start: { x, y },
      end: { x: end, y },
      thickness,
      color: dashColor,
    });
    x += dash + gap;
  }
}

function centeredText(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color = dark,
): void {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_WIDTH - textWidth) / 2,
    y,
    size,
    font,
    color,
  });
}

export async function buildQuoteReceiptPdf(
  data: QuoteReceiptPdfData,
): Promise<Buffer> {
  const boldFont0 = StandardFonts.CourierBold;
  const regularFont0 = StandardFonts.Courier;

  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(boldFont0);
  const regular = await pdfDoc.embedFont(regularFont0);

  const dateObj = data.quoteDate ?? new Date();
  const dateStr = dateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = dateObj.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const qrPayload = [
    `${data.tenantName} — Prescription Quote`,
    `Ref: ${data.requestId}`,
    data.totalCents != null
      ? `Total: Rs. ${(data.totalCents / 100).toFixed(2)}`
      : null,
    data.status ? `Status: ${data.status.toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const qrPngBytes = await QRCode.toBuffer(qrPayload, {
    margin: 0,
    width: 200,
    color: { dark: '#2b2b2b', light: '#00000000' },
  });
  const qrImage = await pdfDoc.embedPng(qrPngBytes);
  const qrSize = 70;

  const footerLine1 =
    'This is a price quote, not a final invoice — it may change if the shop revises its response.';
  const footerLine2 = `Issued by ${data.tenantName} via the ZyroHealth telemedicine platform.`;
  const footerLines1 = wrapText(footerLine1, regular, 6.5, CONTENT_WIDTH);
  const footerLines2 = wrapText(footerLine2, regular, 6, CONTENT_WIDTH);

  const items = data.items ?? [];

  // --- layout pass: compute total height top-to-bottom first --------------
  let h = 18; // top padding
  h += 13; // tenant name
  h += 11; // "prescription quote" subtitle
  if (data.shopName) h += 12; // fulfilled-by line
  h += 8; // gap before rule
  h += 10; // dashed rule + gap
  h += 12 * 3; // ref / date / status lines
  h += 10; // dashed rule + gap
  if (items.length > 0) {
    h += items.length * 13;
  } else {
    h +=
      wrapText(
        'Consolidated total — no itemized breakdown provided.',
        regular,
        8,
        CONTENT_WIDTH,
      ).length * 11;
  }
  h += 14; // solid rule + gap
  h += 20; // total row
  if (data.submittedVia) h += 12; // via row
  h += 12; // dashed rule + gap
  h += qrSize + 10; // qr + gap
  h += footerLines1.length * 9 + footerLines2.length * 8 + 6; // footer
  h += 16; // bottom padding

  const page = pdfDoc.addPage([PAGE_WIDTH, h]);
  let y = h - 18;

  centeredText(page, data.tenantName.toUpperCase(), y, bold, 12);
  y -= 13;
  centeredText(page, 'PRESCRIPTION QUOTE', y, regular, 7, gray);
  y -= 11;
  if (data.shopName) {
    centeredText(page, `Fulfilled by ${data.shopName}`, y, regular, 8, gray);
    y -= 12;
  }
  y -= 8;
  drawDashedLine(page, y);
  y -= 20;

  const rowLabel = (
    label: string,
    value: string,
    font: PDFFont = regular,
  ): void => {
    page.drawText(label, { x: MARGIN, y, size: 8, font: regular, color: gray });
    const valWidth = font.widthOfTextAtSize(value, 8);
    page.drawText(value, {
      x: PAGE_WIDTH - MARGIN - valWidth,
      y,
      size: 8,
      font,
      color: dark,
    });
    y -= 12;
  };

  rowLabel('Ref:', data.requestId.slice(0, 8).toUpperCase());
  rowLabel('Date:', `${dateStr}  ${timeStr}`);
  if (data.status) rowLabel('Status:', data.status.toUpperCase(), bold);

  y -= 10;
  drawDashedLine(page, y);
  y -= 20;

  if (items.length > 0) {
    for (const item of items) {
      const qty = item.quantity ?? 1;
      const nameSuffix = qty > 1 ? ` x${qty}` : '';
      const amount =
        item.priceCents != null
          ? `Rs.${((item.priceCents * qty) / 100).toFixed(2)}`
          : '—';
      const amountWidth = regular.widthOfTextAtSize(amount, 8);
      const nameMaxWidth = CONTENT_WIDTH - amountWidth - 8;
      const name = truncateToWidth(
        `${item.name}${nameSuffix}`,
        regular,
        8,
        nameMaxWidth,
      );
      page.drawText(name, {
        x: MARGIN,
        y,
        size: 8,
        font: regular,
        color: dark,
      });
      page.drawText(amount, {
        x: PAGE_WIDTH - MARGIN - amountWidth,
        y,
        size: 8,
        font: regular,
        color: dark,
      });
      y -= 13;
    }
  } else {
    for (const line of wrapText(
      'Consolidated total — no itemized breakdown provided.',
      regular,
      8,
      CONTENT_WIDTH,
    )) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: 8,
        font: regular,
        color: gray,
      });
      y -= 11;
    }
  }

  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: dark,
  });
  y -= 22;

  page.drawText('Total', { x: MARGIN, y, size: 13, font: bold, color: dark });
  const totalStr =
    data.totalCents != null ? `Rs.${(data.totalCents / 100).toFixed(2)}` : '—';
  const totalWidth = bold.widthOfTextAtSize(totalStr, 13);
  page.drawText(totalStr, {
    x: PAGE_WIDTH - MARGIN - totalWidth,
    y,
    size: 13,
    font: bold,
    color: dark,
  });
  y -= 18;

  if (data.submittedVia) {
    rowLabel('Via:', data.submittedVia);
  }

  y -= 10;
  drawDashedLine(page, y);
  y -= qrSize + 10;

  page.drawImage(qrImage, {
    x: (PAGE_WIDTH - qrSize) / 2,
    y,
    width: qrSize,
    height: qrSize,
  });
  y -= 8;

  for (const line of footerLines1) {
    centeredText(page, line, y, bold, 6.5, dark);
    y -= 9;
  }
  for (const line of footerLines2) {
    centeredText(page, line, y, regular, 6, gray);
    y -= 8;
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
