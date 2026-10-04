import { describe, expect, it } from "vitest";
import { checkAnswer, extractNumbers } from "@/lib/rag/validate";

const cite = (citedText: string) => ({ citedText });

describe("extractNumbers", () => {
  it("skips list ordinals and citation markers, keeps specs", () => {
    const nums = extractNumbers("1. Remove the plug [2].\n2. Tighten to 49 N·m (36 ft·lbf).");
    expect(nums).toEqual([
      { value: "49", hasUnit: true },
      { value: "36", hasUnit: true },
    ]);
  });

  it("normalises thousands separators and decimal commas", () => {
    expect(extractNumbers("1,250 kgf·cm and 2,65 L").map((n) => n.value)).toEqual(["1250", "2.65"]);
  });
});

describe("checkAnswer", () => {
  it("passes when every cited number appears in the cited manual text", () => {
    const warnings = checkAnswer([
      {
        text: "Tighten the drain plug to 49 N·m (36 ft·lbf).",
        citations: [cite("Install the drain plug with a new gasket. Torque: 49 N*m (500 kgf*cm, 36 ft*lbf)")],
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("flags a cited number that isn't in the source (e.g. a mis-copied torque)", () => {
    const warnings = checkAnswer([
      { text: "Tighten the drain plug to 59 N·m.", citations: [cite("Torque: 49 N*m (500 kgf*cm, 36 ft*lbf)")] },
    ]);
    expect(warnings).toEqual([
      { kind: "number_not_in_source", value: "59", context: "Tighten the drain plug to 59 N·m." },
    ]);
  });

  it("flags spec-like numbers with units that have no citation", () => {
    const warnings = checkAnswer([{ text: "Typically this is around 65 ft·lbf.", citations: [] }]);
    expect(warnings).toMatchObject([{ kind: "uncited_spec", value: "65" }]);
  });

  it("ignores unit-less numbers in uncited connective text", () => {
    expect(checkAnswer([{ text: "There are 2 plugs to replace:", citations: [] }])).toEqual([]);
  });
});
