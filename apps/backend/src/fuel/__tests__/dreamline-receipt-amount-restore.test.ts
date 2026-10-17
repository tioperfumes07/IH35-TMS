/** LEAD 443.197 — the narrow audited writer restoring a Dreamline-adopted receipt's own gross / discount. */
import { describe, expect, it, vi } from "vitest";

const audits: unknown[][] = [];
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async (...a: unknown[]) => { audits.push(a); }) }));

import { restoreDreamlineAdoptedReceiptAmounts, restoredPairHoldsInvariant } from "../dreamline-receipt-amount-restore.service.js";

function client(row: Record<string, unknown> | undefined) {
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  return {
    updates,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FOR UPDATE")) return { rows: row ? [row] : [] };
      updates.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }),
  };
}
const receipt = { total_cost: "559.87", gross_cost: "537.97", discount_amount: "43.14", notes: "dreamline_efs=40828:ULSD:1", voided: false };
const input = (c: unknown) => ({ operatingCompanyId: "co", actorUserId: "u", reason: "r", restores: [{ fuel_transaction_id: "ft", gross_cost: null, discount_amount: "0" }] });

describe("restoreDreamlineAdoptedReceiptAmounts (443.197)", () => {
  it("writes gross_cost / discount_amount only, audited with before / after", async () => {
    audits.length = 0;
    const c = client(receipt);
    const out = await restoreDreamlineAdoptedReceiptAmounts(c as never, input(c));
    expect(out[0]!.before).toEqual({ gross_cost: "537.97", discount_amount: "43.14" });
    expect(c.updates).toHaveLength(1);
    expect(c.updates[0]!.sql).toMatch(/SET gross_cost = \$3::numeric, discount_amount = \$4::numeric, updated_at = now\(\)/);
    expect(c.updates[0]!.sql).not.toMatch(/total_cost|notes/);
    expect(audits).toHaveLength(1);
    expect(audits[0]![2]).toBe("fuel.dreamline_adopted_receipt_amounts_restored");
  });
  it.each([
    ["missing row", undefined, "not_found"],
    ["voided row", { ...receipt, voided: true }, "voided"],
    ["row with no adoption marker", { ...receipt, notes: "" }, "not_an_adopted_receipt"],
    ["a statement import row", { ...receipt, notes: "card=…7097; efs_invoice=1; 443.142 Dreamline statement; dreamline_efs=1:ULSD:1" }, "statement_row"],
  ])("refuses a %s", async (_n, row, why) => {
    const c = client(row as never);
    await expect(restoreDreamlineAdoptedReceiptAmounts(c as never, input(c))).rejects.toThrow(why);
    expect(c.updates).toHaveLength(0);
  });
  it("refuses a pair that would break total = gross − discount", async () => {
    const c = client(receipt);
    await expect(restoreDreamlineAdoptedReceiptAmounts(c as never, { operatingCompanyId: "co", actorUserId: "u", reason: "r",
      restores: [{ fuel_transaction_id: "ft", gross_cost: "600.00", discount_amount: "0" }] })).rejects.toThrow("restored_pair_breaks_total");
  });
  it("invariant", () => {
    expect(restoredPairHoldsInvariant("559.87", null, "0")).toBe(true);
    expect(restoredPairHoldsInvariant("559.87", "559.87", "0")).toBe(true);
    expect(restoredPairHoldsInvariant("559.87", "537.97", "43.14")).toBe(false);
  });
});
