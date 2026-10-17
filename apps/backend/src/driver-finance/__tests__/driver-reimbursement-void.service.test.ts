// LEAD 443.197 — fail-old: before this, no reimbursement void writer existed (the module did not exist), so a seed-run
// orphan reimbursement could only stay pending and re-materialize onto the next settlement covering its load.
import { beforeEach, describe, expect, it, vi } from "vitest";

const stamp = vi.fn(async (_c: unknown, p: Record<string, unknown>) => ({ voided_at: "2026-10-17T18:00:00Z", ...p }));
const audit = vi.fn(async () => undefined);
vi.mock("../../accounting/void-document-stamp.service.js", () => ({ stampDocumentVoided: (c: unknown, p: Record<string, unknown>) => stamp(c, p) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: (...a: unknown[]) => (audit as (...x: unknown[]) => unknown)(...a) }));

import { DriverReimbursementVoidError, voidUnsettledDriverReimbursement } from "../driver-reimbursement-void.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const RID = "11111111-1111-1111-1111-111111111111";
const ACTOR = "33333333-3333-3333-3333-333333333333";

function row(o: Record<string, unknown> = {}) {
  return {
    id: RID, driver_id: "d1", load_id: "l1", amount_cents: "2830", status: "pending", pay_mode: "settlement", paid_at: null,
    journal_entry_id: null, applied_to_settlement_id: null, settlement_line_id: null, voided_at: null, ...o,
  };
}
function client(r: Record<string, unknown> | null, liveLines = 0) {
  const calls: string[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes("FROM driver_finance.driver_reimbursements")) return { rows: r ? [r] : [] };
      if (sql.includes("FROM driver_finance.settlement_lines")) return { rows: [{ n: liveLines }] };
      return { rows: [] };
    }),
  };
}
const input = { operating_company_id: CO, reimbursement_id: RID, reason: "seed orphan", actor_user_id: ACTOR };

describe("voidUnsettledDriverReimbursement — LEAD 443.197", () => {
  beforeEach(() => { stamp.mockClear(); audit.mockClear(); });

  it("voids a pending, unpaid, unposted, unapplied reimbursement through the void stamp + one audit row", async () => {
    const c = client(row());
    const out = await voidUnsettledDriverReimbursement(c as never, input);
    expect(out).toMatchObject({ id: RID, amount_cents: 2830, voided_at: "2026-10-17T18:00:00Z" });
    expect(stamp).toHaveBeenCalledTimes(1);
    expect(stamp.mock.calls[0][1]).toMatchObject({ family: "driver_reimbursement", documentId: RID, voidReason: "seed orphan", voidedByUserId: ACTOR, operatingCompanyId: CO });
    expect(audit).toHaveBeenCalledTimes(1);
    expect((audit.mock.calls[0] as unknown[])[2]).toBe("driver_finance.reimbursement.voided");
    // never a raw UPDATE of the reimbursement and never a JE
    expect(c.calls.some((s) => /UPDATE\s+driver_finance\.driver_reimbursements/i.test(s))).toBe(false);
    expect(c.calls.some((s) => /journal_entr/i.test(s) && /INSERT/i.test(s))).toBe(false);
  });

  const refusals: Array<[string, Record<string, unknown> | null, number, string]> = [
    ["missing", null, 0, "reimbursement_not_found"],
    ["already voided", row({ voided_at: "2026-10-01" }), 0, "reimbursement_already_voided"],
    ["status void", row({ status: "void" }), 0, "reimbursement_already_voided"],
    ["paid status", row({ status: "paid" }), 0, "reimbursement_not_pending"],
    ["settled status", row({ status: "settled" }), 0, "reimbursement_not_pending"],
    ["paid_at stamped", row({ paid_at: "2026-10-01" }), 0, "reimbursement_paid"],
    ["posted", row({ journal_entry_id: "je" }), 0, "reimbursement_posted"],
    ["applied to a settlement", row({ applied_to_settlement_id: "s" }), 0, "reimbursement_on_settlement"],
    ["on a settlement line", row({ settlement_line_id: "sl" }), 0, "reimbursement_on_settlement"],
    ["named by a live line", row(), 1, "reimbursement_on_live_line"],
  ];
  for (const [name, r, live, code] of refusals) {
    it(`refuses: ${name}`, async () => {
      const err = await voidUnsettledDriverReimbursement(client(r, live) as never, input).catch((e) => e);
      expect(err).toBeInstanceOf(DriverReimbursementVoidError);
      expect(err.code).toBe(code);
      expect(stamp).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    });
  }

  it("refuses a blank reason", async () => {
    const err = await voidUnsettledDriverReimbursement(client(row()) as never, { ...input, reason: "  " }).catch((e) => e);
    expect(err.code).toBe("void_reason_required");
  });
});
