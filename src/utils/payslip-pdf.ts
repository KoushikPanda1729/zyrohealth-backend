import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';

export interface PayslipLine {
  label: string;
  amountCents: number;
}

export interface PayslipPdfData {
  shopName: string;
  employeeName: string;
  employeeCode?: string;
  month: string; // 'YYYY-MM'
  workingDaysInMonth: number;
  presentDays: number;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  baseSalaryCents: number;
  proRatedGrossCents: number;
  earnings: PayslipLine[]; // bonuses etc, in addition to pro-rated gross
  deductions: PayslipLine[]; // owner deductions + statutory, all together
  netPayCents: number;
  status: string;
}

// A4-proportioned single page — deliberately plain/tabular (no logo
// image embedding here, since a payslip is a financial record meant to
// print cleanly, not a marketing document). Amounts use "Rs." rather
// than "₹" for the same StandardFonts WinAnsi-encoding reason as
// quote-receipt-pdf.ts.
const PAGE_WIDTH = 420;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const dark = rgb(0.15, 0.15, 0.15);
const gray = rgb(0.45, 0.45, 0.45);
const ruleColor = rgb(0.8, 0.8, 0.8);

function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}Rs.${(Math.abs(cents) / 100).toFixed(2)}`;
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

export async function buildPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const rowLine = (
    page: PDFPage,
    y: number,
    label: string,
    value: string,
    font: PDFFont = regular,
    color = dark,
  ): void => {
    page.drawText(label, { x: MARGIN, y, size: 9, font: regular, color: gray });
    const valWidth = font.widthOfTextAtSize(value, 9);
    page.drawText(value, {
      x: PAGE_WIDTH - MARGIN - valWidth,
      y,
      size: 9,
      font,
      color,
    });
  };

  const drawRule = (page: PDFPage, y: number): void => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: ruleColor,
    });
  };

  const disclaimer =
    'Statutory deduction rates shown here are configured by the shop and are a starting point, not certified tax/compliance advice.';
  const disclaimerLines = wrapText(disclaimer, regular, 6.5, CONTENT_WIDTH);

  // --- layout pass ----------------------------------------------------
  let h = 30; // top padding
  h += 18; // shop name
  h += 14; // "Payslip" subtitle
  h += 16; // gap + rule
  h += 14 * 3; // employee / month / status
  h += 16; // gap + rule
  h += 16; // "Attendance" heading
  h += 14 * 5; // 5 attendance rows
  h += 16; // gap + rule
  h += 16; // "Earnings" heading
  h += 14 * (1 + data.earnings.length); // base + extras
  h += 16; // gap + rule
  h += 16; // "Deductions" heading
  h += 14 * Math.max(1, data.deductions.length);
  h += 20; // gap + solid rule
  h += 24; // net pay row
  h += 14; // gap before footer
  h += disclaimerLines.length * 9; // footer note, wrapped
  h += 30; // bottom padding — generous, since small-size text descenders
  // (e.g. "g" in "advice") extend visibly below the last line's baseline

  const page = pdfDoc.addPage([PAGE_WIDTH, h]);
  let y = h - 30;

  page.drawText(data.shopName, { x: MARGIN, y, size: 15, font: bold, color: dark });
  y -= 18;
  page.drawText('PAYSLIP', { x: MARGIN, y, size: 9, font: regular, color: gray });
  y -= 16;
  drawRule(page, y);
  y -= 18;

  rowLine(page, y, 'Employee', data.employeeName, bold);
  y -= 14;
  if (data.employeeCode) {
    rowLine(page, y, 'Employee Code', data.employeeCode);
    y -= 14;
  }
  rowLine(page, y, 'Pay Period', monthLabel(data.month), bold);
  y -= 14;
  rowLine(page, y, 'Status', data.status.toUpperCase(), bold);
  y -= 18;
  drawRule(page, y);
  y -= 18;

  page.drawText('Attendance', { x: MARGIN, y, size: 10, font: bold, color: dark });
  y -= 16;
  rowLine(page, y, 'Working days in month', String(data.workingDaysInMonth));
  y -= 14;
  rowLine(page, y, 'Present', String(data.presentDays));
  y -= 14;
  rowLine(page, y, 'Half days', String(data.halfDays));
  y -= 14;
  rowLine(page, y, 'Paid leave', String(data.paidLeaveDays));
  y -= 14;
  rowLine(page, y, 'Unpaid leave / absent', String(data.unpaidLeaveDays + data.absentDays));
  y -= 18;
  drawRule(page, y);
  y -= 18;

  page.drawText('Earnings', { x: MARGIN, y, size: 10, font: bold, color: dark });
  y -= 16;
  rowLine(page, y, 'Pro-rated base salary', money(data.proRatedGrossCents));
  y -= 14;
  for (const line of data.earnings) {
    rowLine(page, y, line.label, money(line.amountCents));
    y -= 14;
  }
  y -= 4;
  drawRule(page, y);
  y -= 18;

  page.drawText('Deductions', { x: MARGIN, y, size: 10, font: bold, color: dark });
  y -= 16;
  if (data.deductions.length === 0) {
    page.drawText('None', { x: MARGIN, y, size: 9, font: regular, color: gray });
    y -= 14;
  } else {
    for (const line of data.deductions) {
      rowLine(page, y, line.label, `-${money(line.amountCents)}`);
      y -= 14;
    }
  }
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1.25,
    color: dark,
  });
  y -= 24;

  page.drawText('Net Pay', { x: MARGIN, y, size: 13, font: bold, color: dark });
  const netStr = money(data.netPayCents);
  const netWidth = bold.widthOfTextAtSize(netStr, 13);
  page.drawText(netStr, { x: PAGE_WIDTH - MARGIN - netWidth, y, size: 13, font: bold, color: dark });
  y -= 24;

  for (const line of disclaimerLines) {
    page.drawText(line, { x: MARGIN, y, size: 6.5, font: regular, color: gray });
    y -= 9;
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
