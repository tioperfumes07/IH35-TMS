import { describe, expect, it } from "vitest";
import { boundJeMemo, JE_MEMO_MAX_CHARS } from "../je-memo.js";

describe("boundJeMemo (R-197)", () => {
  it("keeps a short memo unchanged (whitespace collapsed)", () => {
    expect(boundJeMemo("Reversal of  expense 13546-2")).toBe("Reversal of expense 13546-2");
  });
  it("bounds a long reversal memo to 200 chars with an ellipsis", () => {
    const m = boundJeMemo(`Reversal of journal entry 05f65bed-328e-43df-a85a-de115b074aea: ${"R-159 wire fee split ".repeat(20)}`);
    expect(m.length).toBe(JE_MEMO_MAX_CHARS);
    expect(m.endsWith("…")).toBe(true);
  });
});
