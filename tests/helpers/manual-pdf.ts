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
