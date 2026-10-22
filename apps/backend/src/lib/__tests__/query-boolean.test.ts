// LEAD 443.217 — the one query-string boolean parser.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseQueryBoolean, queryBoolean } from "../query-boolean.js";

describe("queryBoolean (443.217)", () => {
  it("maps the literal strings, never Boolean(string)", () => {
    for (const [v, want] of [["false", false], ["FALSE", false], ["0", false], ["", false], [0, false], [false, false], ["true", true], ["1", true], [1, true], [true, true]] as const) {
      expect(parseQueryBoolean(v)).toBe(want);
    }
    expect(parseQueryBoolean(undefined)).toBeUndefined();
  });
  it("keeps .default / .optional working and rejects junk", () => {
    const s = z.object({ a: queryBoolean().default(true), b: queryBoolean().optional(), c: queryBoolean().optional().default(false) });
    expect(s.parse({})).toEqual({ a: true, b: undefined, c: false });
    expect(s.parse({ a: "false", b: "true", c: "1" })).toEqual({ a: false, b: true, c: true });
    expect(s.safeParse({ a: "yes" }).success).toBe(false);
    // the defect: z.coerce.boolean() turned "false" into true
    expect(z.coerce.boolean().parse("false")).toBe(true);
  });
});
