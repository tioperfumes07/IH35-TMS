// LEAD 443.219 (runtime audit F-r1) — a bigint SUM / COUNT never string-concatenates. Fails on origin/main: no parser module,
// every int8 arrived as a string ("100" + "50" = "10050").
import { describe, expect, it } from "vitest";
import pg from "pg";

describe("443.219 — pg int8 parser", () => {
  it("is registered by auth/db.ts and turns int8 into numbers, so a sum adds instead of concatenating", async () => {
    await import("../../auth/db.js");
    const parse = pg.types.getTypeParser(20, "text") as (v: string) => unknown;
    const rows = [{ amount_cents: parse("100") }, { amount_cents: parse("50") }];
    let total: unknown = 0;
    for (const r of rows) total = (total as number) + (r.amount_cents as number);
    expect(total).toBe(150);
  });

  it("keeps an int8 beyond the safe range as its exact string (never a rounded number)", async () => {
    const { parseInt8 } = await import("../pg-type-parsers.js");
    expect(parseInt8("9007199254740993")).toBe("9007199254740993");
    expect(parseInt8("-42")).toBe(-42);
    expect(parseInt8(null)).toBeNull();
  });

  it("leaves numeric (money) as an exact decimal string", async () => {
    await import("../../auth/db.js");
    const parseNumeric = pg.types.getTypeParser(1700, "text") as (v: string) => unknown;
    expect(parseNumeric("1726.40")).toBe("1726.40");
  });
});
