import { describe, expect, it } from "vitest";
import { statusListCondition, statusListParam } from "../status-list.js";

describe("U12 status-list — one parser, one condition", () => {
  const schema = statusListParam(["open", "applied", "voided", "active"] as const);

  it("accepts one status or a repeated list, and nothing", () => {
    expect(schema.parse("open")).toEqual(["open"]);
    expect(schema.parse(["open", "applied"])).toEqual(["open", "applied"]);
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.safeParse("bogus").success).toBe(false);
  });

  it("builds = ANY for literal statuses", () => {
    const params: unknown[] = [];
    const sql = statusListCondition("cm.status", ["open", "applied"], (v) => { params.push(v); return `$${params.length}`; });
    expect(sql).toBe("cm.status::text = ANY($1::text[])");
    expect(params).toEqual([["open", "applied"]]);
  });

  it('ORs the "active = not voided" pseudo-status with literal picks', () => {
    const params: unknown[] = [];
    const pseudo = { notVoidedPseudo: { value: "active", excludes: ["voided"] } };
    expect(statusListCondition("cm.status", ["active"], (v) => { params.push(v); return `$${params.length}`; }, pseudo)).toBe(
      "cm.status::text <> ALL($1::text[])"
    );
    const p2: unknown[] = [];
    expect(statusListCondition("cm.status", ["active", "voided"], (v) => { p2.push(v); return `$${p2.length}`; }, pseudo)).toBe(
      "(cm.status::text <> ALL($1::text[]) OR cm.status::text = ANY($2::text[]))"
    );
    expect(p2).toEqual([["voided"], ["voided"]]);
  });

  it("returns null when nothing is picked (no filter)", () => {
    expect(statusListCondition("x.status", [], () => "$1")).toBeNull();
    expect(statusListCondition("x.status", undefined, () => "$1")).toBeNull();
  });
});
