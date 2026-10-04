import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface FixturePage {
  heading?: string;
  subheading?: string;
  lines?: string[];
  /** No text layer at all — simulates a scanned page. */
  scanned?: boolean;
}

/** Builds a small, real PDF with a running header, headings, and body text. */
export async function buildManualPdf(pages: FixturePage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const [i, p] of pages.entries()) {
    const page = doc.addPage([612, 792]);
    if (p.scanned) {
      // Vector shapes only: looks like content, but there is no extractable text.
      page.drawRectangle({ x: 50, y: 200, width: 500, height: 500, color: rgb(0.9, 0.9, 0.9) });
      page.drawLine({ start: { x: 60, y: 650 }, end: { x: 540, y: 250 }, thickness: 3 });
      continue;
    }
    let y = 760;
    page.drawText("2019 TACOMA REPAIR MANUAL (RM0000TEST)", { x: 50, y, size: 8, font });
    y -= 40;
    if (p.heading) {
      page.drawText(p.heading, { x: 50, y, size: 18, font: bold });
      y -= 30;
    }
    if (p.subheading) {
      page.drawText(p.subheading, { x: 50, y, size: 13, font: bold });
      y -= 24;
    }
    for (const line of p.lines ?? []) {
      page.drawText(line, { x: 50, y, size: 10, font });
      y -= 14;
    }
    page.drawText(`Page ${i + 1}`, { x: 290, y: 30, size: 8, font });
  }
  return doc.save();
}

/** A 6-page "manual": axle procedures with a torque table, an engine section, and one scanned page. */
export function tacomaManualPdf() {
  return buildManualPdf([
    {
      heading: "REAR AXLE",
      subheading: "Differential Oil Replacement",
      lines: [
        "1. Remove the rear differential filler plug and gasket.",
        "2. Remove the drain plug and gasket and drain the oil.",
        "3. Install the drain plug with a new gasket.",
        "Torque: 49 N*m (500 kgf*cm, 36 ft*lbf)",
        "4. Fill with hypoid gear oil API GL-5 SAE 75W-85.",
        "Standard capacity: 2.65 liters (2.80 US qts)",
      ],
    },
    {
      lines: [
        "5. Install the filler plug with a new gasket.",
        "Torque: 49 N*m (500 kgf*cm, 36 ft*lbf)",
        "Check for leaks after a short test drive.",
      ],
    },
    {
      heading: "ENGINE",
      subheading: "Engine Oil Replacement",
      lines: [
        "1. Remove the oil drain plug and gasket and drain the engine oil.",
        "2. Install a new gasket and the drain plug.",
        "Torque: 40 N*m (408 kgf*cm, 30 ft*lbf)",
        "Oil capacity with filter: 5.7 liters (6.0 US qts)",
      ],
    },
    { scanned: true },
    {
      heading: "BRAKES",
      subheading: "Front Brake Pads",
      lines: ["Minimum pad thickness: 1.0 mm (0.039 in.)", "Caliper bracket bolt torque: 123 N*m (1250 kgf*cm, 91 ft*lbf)"],
    },
    {
      lines: ["Bleed the brake system after replacing calipers.", "Use only SAE J1703 or FMVSS No. 116 DOT 3 fluid."],
    },
  ]);
}
