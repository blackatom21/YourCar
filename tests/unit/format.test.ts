import { describe, expect, it } from "vitest";
import { formatDate, formatLabor, parseLaborMinutes, parseMoneyToCents } from "@/lib/format";

describe("parseMoneyToCents", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.05", 1205],
    ["$1,299.99", 129999],
    ["0.1", 10],
  ])("%s → %d", (input, cents) => expect(parseMoneyToCents(input)).toBe(cents));

  it("treats blank as null", () => expect(parseMoneyToCents("  ")).toBeNull());
  it.each(["abc", "1.234", "-5", "1.2.3"])("rejects %s", (input) =>
    expect(parseMoneyToCents(input)).toBeNaN(),
  );
});

describe("parseLaborMinutes", () => {
  it.each([
    ["90", 90],
    ["1:30", 90],
    ["1.5h", 90],
    ["2h", 120],
    ["1h 15m", 75],
    ["45m", 45],
    ["2 hours", 120],
  ])("%s → %d", (input, minutes) => expect(parseLaborMinutes(input)).toBe(minutes));

  it("treats blank as null", () => expect(parseLaborMinutes("")).toBeNull());
  it("rejects garbage", () => expect(parseLaborMinutes("soon")).toBeNaN());
});

describe("formatters", () => {
  it("formats labor", () => expect(formatLabor(75)).toBe("1h 15m"));
  it("formats calendar dates without time-zone drift", () =>
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026"));
});
