import { describe, expect, it, vi } from "vitest";
import { loadPayRunRecoveryReversal } from "../settlement-payrun-recovery.service.js";
const input = { operatingCompanyId: "company", settlementId: "settlement", journalEntryId: "je" };
function client(payload: unknown, rows: unknown[]) {
  return { query: vi.fn().mockResolvedValueOnce({ rows: [{ payload }] }).mockResolvedValueOnce({ rows }) };
}
describe("REG-040 exact per-posting advance reversal", () => {
  it("restores only this posting's partial recovery, not principal", async () => {
    const c = client({ advance_recoveries_cents: 300, recovery_snapshots: [{ id: "a", liability_id: "liability", recovered_cents: 300 }] },
      [{ id: "a", amount_cents: "1000", liability_id: "liability", recovered_in_settlement_id: null }]);
    expect(await loadPayRunRecoveryReversal(c, input)).toEqual([{ id: "a", liability_id: "liability", recovered_cents: 300 }]);
    expect(c.query.mock.calls[0][1]).toEqual(["company", "settlement", "je"]);
  });
  it("accepts legacy whole-principal recovery only when exact run audit matches", async () => {
    const c = client({ advance_recoveries_cents: 1000, recovered_advance_ids: ["a"] },
      [{ id: "a", amount_cents: "1000", liability_id: null, recovered_in_settlement_id: "settlement" }]);
    expect((await loadPayRunRecoveryReversal(c, input))[0].recovered_cents).toBe(1000);
  });
  it.each([null, "settlement"])("rejects ambiguous legacy partial/prior-partial history (%s)", async recovered => {
    const c = client({ advance_recoveries_cents: 600, recovered_advance_ids: ["a"] },
      [{ id: "a", amount_cents: "1000", liability_id: null, recovered_in_settlement_id: recovered }]);
    await expect(loadPayRunRecoveryReversal(c, input)).rejects.toThrow("partial or ambiguous");
  });
  it("refuses to undo a later settlement's full recovery", async () => {
    const c = client({ advance_recoveries_cents: 300, recovery_snapshots: [{ id: "a", liability_id: null, recovered_cents: 300 }] },
      [{ id: "a", amount_cents: "1000", liability_id: null, recovered_in_settlement_id: "later-settlement" }]);
    await expect(loadPayRunRecoveryReversal(c, input)).rejects.toThrow("later settlement");
  });
  it("zero recovery is a proven no-op when the immutable run audit says zero", async () => {
    expect(await loadPayRunRecoveryReversal(client({ advance_recoveries_cents: 0, recovered_advance_ids: [] }, []), input)).toEqual([]);
  });
});
