import { describe, expect, it } from "vitest";
import { chunkManual, embeddingText } from "@/lib/rag/chunk";
import type { PageBlocks } from "@/lib/rag/types";

const para = (n: number, word = "lorem") => Array.from({ length: n }, (_, i) => `${word} ${i}.`).join(" ");

describe("chunkManual", () => {
  it("tracks section paths across pages and starts a chunk per major section", () => {
    const pages: PageBlocks[] = [
      {
        page: 10,
        blocks: [
          { type: "heading", level: 1, text: "Rear Axle" },
          { type: "heading", level: 2, text: "Drain and Fill" },
          { type: "text", text: "Remove the drain plug." },
        ],
      },
      {
        page: 11,
        blocks: [
          { type: "text", text: "Install the drain plug with a new gasket. Torque: 49 N·m." },
          { type: "heading", level: 2, text: "Inspection" },
          { type: "text", text: "Check for leaks." },
        ],
      },
    ];
    const chunks = chunkManual(pages);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ pageStart: 10, pageEnd: 11, sectionPath: "Rear Axle > Drain and Fill" });
    expect(chunks[0].segments.map((s) => s.page)).toEqual([10, 11]);
    expect(chunks[0].segments[1].text).toContain("49 N·m");
    expect(chunks[1]).toMatchObject({ pageStart: 11, pageEnd: 11, sectionPath: "Rear Axle > Inspection" });
  });

  it("splits long sections near the size limit with sentence-boundary overlap", () => {
    const pages: PageBlocks[] = [
      { page: 1, blocks: [{ type: "heading", level: 1, text: "Engine" }] },
      { page: 1, blocks: [{ type: "text", text: para(150) }] },
      { page: 2, blocks: [{ type: "text", text: para(150, "ipsum") }] },
    ];
    const chunks = chunkManual(pages, { maxChars: 800, minChars: 200, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(800 + 100);
      expect(c.sectionPath).toBe("Engine");
    }
    // Overlap: each chunk after the first starts with text that ended the previous one.
    const firstWords = chunks[1].content.split(" ").slice(0, 2).join(" ");
    expect(chunks[0].content).toContain(firstWords);
    // Every page is covered and page numbers are monotonic.
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks.at(-1)!.pageEnd).toBe(2);
  });

  it("keeps a table whole and never emits overlap-only chunks", () => {
    const table = ["| Item | N·m |", ...Array.from({ length: 20 }, (_, i) => `| Bolt ${i} | ${i + 10} |`)].join("\n");
    const chunks = chunkManual(
      [{ page: 5, blocks: [{ type: "text", text: para(30) }, { type: "table", text: table }] }],
      { maxChars: 600, minChars: 100, overlapChars: 80 },
    );
    const withTable = chunks.filter((c) => c.content.includes("| Bolt 0 |"));
    expect(withTable).toHaveLength(1);
    expect(withTable[0].content).toContain("| Bolt 19 |");
    expect(chunks.every((c) => c.content.trim().length > 0)).toBe(true);
  });

  it("splits a huge table by rows and repeats the header", () => {
    const table = ["| Item | N·m |", ...Array.from({ length: 200 }, (_, i) => `| Bolt ${i} | ${i} |`)].join("\n");
    const chunks = chunkManual([{ page: 1, blocks: [{ type: "table", text: table }] }], {
      maxChars: 500,
      minChars: 100,
      overlapChars: 50,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.content.startsWith("| Item | N·m |")).toBe(true);
  });

  it("does not attach overlap from a previous section to a new one", () => {
    const chunks = chunkManual(
      [
        { page: 1, blocks: [{ type: "heading", level: 1, text: "A" }, { type: "text", text: para(120) }] },
        { page: 2, blocks: [{ type: "heading", level: 1, text: "B" }, { type: "text", text: "Only B." }] },
      ],
      { maxChars: 500, minChars: 100, overlapChars: 80 },
    );
    const b = chunks.find((c) => c.sectionPath === "B")!;
    expect(b.content).toBe("Only B.");
    expect(b.pageStart).toBe(2);
  });
});

describe("embeddingText", () => {
  it("prefixes manual title and section path", () => {
    expect(embeddingText("Tacoma FSM", { sectionPath: "Axle > Drain", content: "Body" })).toBe(
      "Tacoma FSM\nAxle > Drain\n\nBody",
    );
  });
});
