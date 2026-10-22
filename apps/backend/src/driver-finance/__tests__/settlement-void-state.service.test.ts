import { beforeEach, describe, expect, it, vi } from "vitest";
const release = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("../../accounting/void.service.js", () => ({ releaseBankLinesNamingDocument: release }));
import { stampSettlementVoidedInClientTx } from "../settlement-void-state.service.js";
import { stampDriverBillVoidedInClientTx } from "../driver-bill-void-state.service.js";

const input = { operatingCompanyId: "company", settlementId: "settlement", userId: "actor", reason: "authorized void" };
function clientFor(row: Record<string, unknown> | undefined) {
  return { query: vi.fn(async (sql: string) => {
    if (sql.includes("FOR UPDATE")) return { rows: row ? [row] : [] };
    if (sql.includes("UPDATE driver_finance.driver_settlements")) return { rows: [{ voided_at: "2026-10-21" }] };
    return { rows: [] };
  }) };
}
describe("one settlement void-state writer", () => {
  beforeEach(() => release.mockClear());
  it("releases naming bank links before a normal state change", async () => {
    const c = clientFor({ status: "open", voided_at: null, reversed_at: null });
    await stampSettlementVoidedInClientTx(c as never, input);
    expect(release).toHaveBeenCalledWith(c, { operatingCompanyId: "company", pointerColumn: "matched_settlement_id", documentId: "settlement" }, { userId: "actor", reason: "authorized void" });
    expect(release.mock.invocationCallOrder[0]).toBeLessThan(c.query.mock.invocationCallOrder[1]);
  });
  it("metadata repair never releases bank links", async () => {
    const c = clientFor({ status: "cancelled", voided_at: "2026-10-01", reversed_at: null });
    await stampSettlementVoidedInClientTx(c as never, { ...input, repairCancelledOnly: true });
    expect(release).not.toHaveBeenCalled();
  });
  it.each([
    { status: "open", voided_at: null, reversed_at: null },
    { status: "cancelled", voided_at: "2026-10-01", reversed_at: null },
    { status: "cancelled", voided_at: null, reversed_at: "2026-10-01" },
  ])("atomically completes both timestamps: %j", async (row) => {
    const c = clientFor(row);
    expect((await stampSettlementVoidedInClientTx(c as never, input)).changed).toBe(true);
    const update = c.query.mock.calls.find(([sql]) => sql.includes("UPDATE driver_finance"))![0];
    expect(update).toContain("status = 'cancelled'");
    expect(update).toContain("voided_at = COALESCE(voided_at, reversed_at, now())");
    expect(update).toContain("reversed_at = COALESCE(reversed_at, voided_at, now())");
    expect(update).toContain("operating_company_id = $2::uuid");
    expect(c.query.mock.calls.some(([sql]) => sql.includes("audit.append_event"))).toBe(true);
    expect(c.query.mock.calls.some(([sql]) => /journal|posting/i.test(sql))).toBe(false);
  });
  it("is idempotent on a complete cancelled header", async () => {
    const c = clientFor({ status: "cancelled", voided_at: "2026-10-01", reversed_at: "2026-10-01" });
    expect((await stampSettlementVoidedInClientTx(c as never, input)).changed).toBe(false);
    expect(c.query).toHaveBeenCalledTimes(1);
  });
  it("repair-only refuses a live header", async () => {
    const c = clientFor({ status: "open", voided_at: null, reversed_at: null });
    await expect(stampSettlementVoidedInClientTx(c as never, { ...input, repairCancelledOnly: true })).rejects.toThrow("requires_cancelled");
    expect(c.query).toHaveBeenCalledTimes(1);
  });
  it("never cancels a paid settlement", async () => {
    await expect(stampSettlementVoidedInClientTx(clientFor({ status: "paid" }) as never, input)).rejects.toThrow("blocked_paid");
  });
  it("refuses missing and cross-company records", async () => {
    await expect(stampSettlementVoidedInClientTx(clientFor(undefined) as never, input)).rejects.toThrow("not_found");
  });
  it("propagates audit failure so the caller rolls back", async () => {
    const c = clientFor({ status: "open" });
    c.query.mockImplementation(async (sql) => {
      if (sql.includes("audit.append_event")) throw new Error("audit unavailable");
      if (sql.includes("UPDATE driver_finance")) return { rows: [{ voided_at: "2026-10-21" }] };
      return { rows: [{ status: "open", voided_at: null, reversed_at: null }] };
    });
    await expect(stampSettlementVoidedInClientTx(c as never, input)).rejects.toThrow("audit unavailable");
  });
});
describe("one driver-bill void-state writer", () => {
  it("retains company and open-only race predicates", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("UPDATE") ? [{ id: "bill" }] : [] }));
    expect(await stampDriverBillVoidedInClientTx({ query } as never, { ...input, driverBillId: "bill", openOnly: true })).toBe(true);
    expect(query.mock.calls[0][0]).toContain("operating_company_id = $2::uuid");
    expect(query.mock.calls[0][0]).toContain("status IN ('open', 'awaiting_short_miles') AND voided_at IS NULL"); // 443.220 editable statuses
    expect(query.mock.calls.some(([sql]) => sql.includes("audit.append_event"))).toBe(true);
  });
  it("does not invent success or audit when no row was updated", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    expect(await stampDriverBillVoidedInClientTx({ query } as never, { ...input, driverBillId: "bill" })).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
