import { describe, expect, it } from "vitest";
import {
  findRepeatedLines,
  headingLevel,
  isPdf,
  itemsToLines,
  linesToBlocks,
  markdownToBlocks,
  type ExtractedPage,
  type Line,
} from "@/lib/rag/extract";

const line = (text: string, fontSize = 10, y = 0): Line => ({ text, fontSize, y });

describe("itemsToLines", () => {
  it("orders items top-to-bottom, left-to-right and joins same-baseline items", () => {
    const lines = itemsToLines([
      { str: "world", x: 38, y: 700, fontSize: 10, width: 25 },
      { str: "Second line", x: 10, y: 680, fontSize: 10, width: 50 },
      { str: "Hello", x: 10, y: 700.5, fontSize: 10, width: 25 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Hello world", "Second line"]);
  });

  it("marks wide column gaps so table rows are recognisable", () => {
    const [row] = itemsToLines([
      { str: "Drain plug", x: 10, y: 500, fontSize: 10, width: 48 },
      { str: "34 N·m", x: 300, y: 500, fontSize: 10, width: 30 },
    ]);
    expect(row.text).toBe("Drain plug | 34 N·m");
  });
});

describe("headingLevel", () => {
  it.each([
    [line("REAR AXLE", 18), 1],
    [line("Drain and Fill", 12), 2],
    [line("4.2.1 Removal", 10), 4],
    [line("SA-23 DIFFERENTIAL OIL", 10), 3],
    [line("DIFFERENTIAL OIL", 10), 3],
  ])("detects %j as level %d", (l, level) => {
    expect(headingLevel(l, 10)).toBe(level);
  });

  it.each([
    line("Remove the drain plug and gasket.", 10),
    line("Drain plug | 34 N·m", 12),
    line("12", 18),
    line("Tighten the bolts in the sequence shown in the illustration below to spec", 10),
  ])("does not treat %j as a heading", (l) => {
    expect(headingLevel(l, 10)).toBe(0);
  });
});

describe("findRepeatedLines + linesToBlocks", () => {
  it("drops running headers/footers and page numbers", () => {
    const topics = ["brakes", "axle", "engine", "cooling", "fuel", "steering"];
    const pages: ExtractedPage[] = topics.map((topic, i) => ({
      page: i + 1,
      needsOcr: false,
      lines: [line("2019 TACOMA REPAIR MANUAL (RM12345U)", 8), line(`Procedure for the ${topic}.`), line(`Page ${i + 1}`, 8)],
    }));
    const repeated = findRepeatedLines(pages);
    const blocks = linesToBlocks(pages[2].lines, repeated);
    expect(blocks).toEqual([{ type: "text", text: "Procedure for the engine." }]);
  });

  it("groups consecutive table rows into one table block", () => {
    const blocks = linesToBlocks([
      line("TORQUE SPECIFICATIONS", 14),
      line("Part | N·m | ft·lbf"),
      line("Drain plug | 49 | 36"),
      line("Fill plug | 49 | 36"),
      line("Use new gaskets."),
    ]);
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "TORQUE SPECIFICATIONS" },
      { type: "table", text: "Part | N·m | ft·lbf\nDrain plug | 49 | 36\nFill plug | 49 | 36" },
      { type: "text", text: "Use new gaskets." },
    ]);
  });
});

describe("markdownToBlocks (OCR output)", () => {
  it("parses headings, paragraphs and tables, skipping separator rows", () => {
    const blocks = markdownToBlocks(
      "# Rear Axle\n\n## Drain and Fill\n\nRemove the plug.\nClean it.\n\n| Item | N·m |\n|---|---|\n| Drain plug | 49 |\n\nDone.",
    );
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Rear Axle" },
      { type: "heading", level: 2, text: "Drain and Fill" },
      { type: "text", text: "Remove the plug.\nClean it." },
      { type: "table", text: "| Item | N·m |\n| Drain plug | 49 |" },
      { type: "text", text: "Done." },
    ]);
  });
});

describe("isPdf", () => {
  it("recognises the PDF signature", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7\n..."))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
  });
});
