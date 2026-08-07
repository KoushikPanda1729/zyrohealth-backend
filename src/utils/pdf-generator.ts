import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrescribedMedicine, OrderedTest } from '../entities/Prescription';

export interface PrescriptionData {
  doctorName: string;
  licenseNumber?: string;
  patientName: string;
  patientAge?: number;
  bloodGroup?: string;
  bookingReference: string;
  date: Date;
  diagnosis?: string;
  notes?: string;
  medicines: PrescribedMedicine[];
  tests: OrderedTest[];
}

export async function buildPrescriptionPdf(
  data: PrescriptionData,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const primaryColor = rgb(0.04, 0.53, 0.6);
  const darkColor = rgb(0.1, 0.1, 0.1);
  const grayColor = rgb(0.5, 0.5, 0.5);
  const lightGray = rgb(0.9, 0.9, 0.9);

  let y = height - 40;
  const margin = 50;
  const contentWidth = width - margin * 2;

  // Header background
  page.drawRectangle({
    x: 0,
    y: height - 100,
    width,
    height: 100,
    color: primaryColor,
  });

  // App name
  page.drawText('FullHealth Telemedicine', {
    x: margin,
    y: height - 35,
    size: 22,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  // Doctor info
  page.drawText(`Dr. ${data.doctorName}`, {
    x: margin,
    y: height - 58,
    size: 11,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  if (data.licenseNumber) {
    page.drawText(`License: ${data.licenseNumber}`, {
      x: margin,
      y: height - 74,
      size: 9,
      font: regularFont,
      color: rgb(0.85, 0.85, 0.85),
    });
  }

  // Date on right
  const dateStr = data.date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  page.drawText(dateStr, {
    x: width - margin - 130,
    y: height - 58,
    size: 10,
    font: regularFont,
    color: rgb(1, 1, 1),
  });

  page.drawText(`Ref: ${data.bookingReference}`, {
    x: width - margin - 130,
    y: height - 74,
    size: 9,
    font: regularFont,
    color: rgb(0.85, 0.85, 0.85),
  });

  y = height - 120;

  // Patient info section
  page.drawRectangle({
    x: margin,
    y: y - 50,
    width: contentWidth,
    height: 60,
    color: lightGray,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
  });

  page.drawText('PATIENT INFORMATION', {
    x: margin + 10,
    y: y - 14,
    size: 8,
    font: boldFont,
    color: grayColor,
  });

  page.drawText(`Name: ${data.patientName}`, {
    x: margin + 10,
    y: y - 28,
    size: 10,
    font: boldFont,
    color: darkColor,
  });

  if (data.patientAge !== undefined) {
    page.drawText(`Age: ${data.patientAge} years`, {
      x: margin + 10,
      y: y - 42,
      size: 9,
      font: regularFont,
      color: darkColor,
    });
  }

  if (data.bloodGroup) {
    page.drawText(`Blood Group: ${data.bloodGroup}`, {
      x: margin + 150,
      y: y - 42,
      size: 9,
      font: regularFont,
      color: darkColor,
    });
  }

  y -= 70;

  // Diagnosis
  if (data.diagnosis) {
    page.drawText('DIAGNOSIS / CLINICAL NOTES', {
      x: margin,
      y,
      size: 8,
      font: boldFont,
      color: primaryColor,
    });
    y -= 15;
    page.drawText(data.diagnosis, {
      x: margin,
      y,
      size: 10,
      font: regularFont,
      color: darkColor,
      maxWidth: contentWidth,
    });
    y -= 15;
  }

  if (data.notes) {
    page.drawText('Notes: ' + data.notes, {
      x: margin,
      y,
      size: 9,
      font: regularFont,
      color: grayColor,
      maxWidth: contentWidth,
    });
    y -= 20;
  }

  y -= 10;

  // Medicines section
  if (data.medicines.length > 0) {
    page.drawText('PRESCRIBED MEDICINES', {
      x: margin,
      y,
      size: 10,
      font: boldFont,
      color: primaryColor,
    });
    y -= 5;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: primaryColor,
    });
    y -= 15;

    // Table header
    const cols = [
      margin,
      margin + 130,
      margin + 220,
      margin + 300,
      margin + 380,
    ];
    const headers = ['Medicine', 'Dosage', 'Frequency', 'Duration', 'Route'];
    headers.forEach((h, i) => {
      page.drawText(h, {
        x: cols[i] ?? margin,
        y,
        size: 8,
        font: boldFont,
        color: darkColor,
      });
    });
    y -= 5;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: grayColor,
    });
    y -= 12;

    for (const med of data.medicines) {
      const values = [
        med.name,
        med.dosage,
        med.frequency,
        med.duration,
        med.route,
      ];
      values.forEach((v, i) => {
        page.drawText(v ?? '-', {
          x: cols[i] ?? margin,
          y,
          size: 9,
          font: regularFont,
          color: darkColor,
          maxWidth: 120,
        });
      });
      y -= 14;

      if (med.notes) {
        page.drawText(`  Note: ${med.notes}`, {
          x: margin,
          y,
          size: 8,
          font: regularFont,
          color: grayColor,
        });
        y -= 12;
      }
    }
  }

  y -= 10;

  // Tests section
  if (data.tests.length > 0) {
    page.drawText('TESTS ORDERED', {
      x: margin,
      y,
      size: 10,
      font: boldFont,
      color: primaryColor,
    });
    y -= 5;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: primaryColor,
    });
    y -= 15;

    for (const test of data.tests) {
      page.drawText(`• ${test.name}`, {
        x: margin,
        y,
        size: 10,
        font: boldFont,
        color: darkColor,
      });
      if (test.category) {
        page.drawText(`[${test.category}]`, {
          x: margin + 150,
          y,
          size: 9,
          font: regularFont,
          color: grayColor,
        });
      }
      y -= 13;
      if (test.instructions) {
        page.drawText(`  Instructions: ${test.instructions}`, {
          x: margin,
          y,
          size: 8,
          font: regularFont,
          color: grayColor,
          maxWidth: contentWidth,
        });
        y -= 12;
      }
    }
  }

  // Footer
  const footerY = 60;
  page.drawLine({
    start: { x: margin, y: footerY + 30 },
    end: { x: width - margin, y: footerY + 30 },
    thickness: 0.5,
    color: lightGray,
  });

  page.drawText(
    'This prescription is valid for 30 days from the date of issue.',
    {
      x: margin,
      y: footerY + 15,
      size: 8,
      font: boldFont,
      color: darkColor,
    },
  );

  page.drawText(
    'DISCLAIMER: This prescription is issued by a licensed medical professional via telemedicine. ' +
      'Please consult a pharmacist before consuming any medication.',
    {
      x: margin,
      y: footerY,
      size: 7,
      font: regularFont,
      color: grayColor,
      maxWidth: contentWidth,
    },
  );

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
