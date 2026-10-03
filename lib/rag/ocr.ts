import "server-only";
import { anthropic, OCR_MODEL } from "./anthropic";
import type { OcrEngine } from "./types";

const OCR_INSTRUCTIONS = `Transcribe this scanned workshop-manual page to Markdown.

Rules:
- Transcribe exactly what is printed. Do not summarise, correct, or add anything.
- Copy every number, unit, part number, and torque/pressure/clearance value character-for-character.
- Use # / ## / ### for printed headings and section titles.
- Render tables as Markdown tables (| col | col |), one printed row per line.
- For diagrams, transcribe any printed labels and callout values as a bullet list under "Figure labels:".
- If a value is illegible, write [illegible] — never guess.
- Output only the Markdown, with no preamble.`;

/** OCR for scanned pages using Claude vision on a single-page PDF. */
export const claudeOcr: OcrEngine = {
  model: OCR_MODEL,
  async ocrPage(singlePagePdf) {
    const response = await anthropic().messages.create({
      model: OCR_MODEL,
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: Buffer.from(singlePagePdf).toString("base64") },
            },
            { type: "text", text: OCR_INSTRUCTIONS },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("OCR request was declined by the model.");
    const markdown = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      markdown,
      usage: {
        provider: "anthropic",
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        pages: 1,
      },
    };
  },
};
