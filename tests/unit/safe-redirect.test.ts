import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/vehicles/123", "/vehicles/123"],
    ["/vehicles?x=1", "/vehicles?x=1"],
  ])("allows relative path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, undefined, 42])(
    "rejects %s",
    (input) => {
      expect(safeNextPath(input)).toBe("/vehicles");
    },
  );
});
