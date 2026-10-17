// LEAD 443.192 (P-0070 cancel) — a driver settlement whose HEADER was already 'cancelled' by a write outside the engine
// ("443.167 regroup": status/voided_at only) kept 10 live settlement_lines, a driver bill linked to the dead settlement,
// and no void audit. executeVoidCancel('driver_settlement') returned already_done on the header alone and could never
// finish it. Fail-old: on the pre-fix executor the already-cancelled case writes no line void and no audit.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reverse: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock("../../lib/company-business-date.js", () => ({ companyBusinessDate: () => "2026-10-17" }));
vi.mock("../../accounting/settlement-posting/settlement-bill-payment-posting.service.js", () => ({
  reverseSettlementBillPaymentInClientTx: mocks.reverse,
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.appendAudit }));

import { executeVoidCancel } from "../void-cancel-executors.js";

const SETTLEMENT = "5950d817-0491-49a3-b580-0e6f834afa1e";
const COMPANY = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USER = "00000000-0000-0000-0000-0000000000aa";

type Q = { sql: string; values?: unknown[] };

function fakeClient(opts: {
  status: string;
  liveLineIds: string[];
  linkedOpenBillIds: string[];
  priorVoidAudits: number;
  settledReimbursementIds?: string[];
}) {
  const calls: Q[] = [];
  let lines = [...opts.liveLineIds];
  let bills = [...opts.linkedOpenBillIds];
  let reimbursements = [...(opts.settledReimbursementIds ?? [])];
  const client = {
    query: async <T,>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> => {
      calls.push({ sql, values });
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] as T[] };
      if (sql.includes("SELECT status::text AS status FROM driver_finance.driver_settlements")) {
        return { rows: [{ status: opts.status }] as T[] };
      }
      if (sql.includes("UPDATE driver_finance.settlement_lines")) {
        const out = lines.map((id) => ({ id }));
        lines = [];
        return { rows: out as T[] };
      }
      if (sql.includes("UPDATE driver_finance.driver_bills")) {
        const out = bills.map((id) => ({ id }));
        bills = [];
        return { rows: out as T[] };
      }
      if (sql.includes("UPDATE driver_finance.driver_reimbursements")) {
        const out = reimbursements.map((id) => ({ id }));
        reimbursements = [];
        return { rows: out as T[] };
      }
      if (sql.includes("FROM audit.audit_events")) return { rows: [{ n: opts.priorVoidAudits }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_settlements")) return { rows: [{ id: SETTLEMENT }] as T[] };
      return { rows: [] as T[] };
    },
  };
  return { client, calls };
}

const ctx = (client: unknown) => ({
  client: client as never,
  operatingCompanyId: COMPANY,
  entityId: SETTLEMENT,
  action: "void" as const,
  userId: USER,
  reason: "443.192 complete the 443.167 regroup void",
});

describe("executeVoidCancel('driver_settlement') — header already cancelled (443.167 regroup)", () => {
  beforeEach(() => {
    mocks.reverse.mockReset().mockResolvedValue({ result: "nothing_to_reverse", settlement_id: SETTLEMENT, run_id: null });
    mocks.appendAudit.mockReset().mockResolvedValue(undefined);
  });

  it("voids the still-live lines, releases the open bill linked to the dead settlement, and writes the void audit", async () => {
    const { client, calls } = fakeClient({
      status: "cancelled",
      liveLineIds: ["58ed998c-3569-41ed-9211-1d2dbac5a158", "b5cff21e-92cc-4101-9176-2964cf953432"],
      linkedOpenBillIds: ["e5cfbcd5-af20-488e-af2b-f252cc6e066e"],
      priorVoidAudits: 0,
    });
    const res = await executeVoidCancel("driver_settlement", ctx(client));
    expect(res.kind).toBe("ok");
    expect(calls.some((c) => c.sql.includes("UPDATE driver_finance.settlement_lines"))).toBe(true);
    // the header is not re-flipped (it is already cancelled; its original void stamp stands)
    expect(calls.some((c) => c.sql.includes("UPDATE driver_finance.driver_settlements"))).toBe(false);
    expect(mocks.reverse).toHaveBeenCalledTimes(1);
    expect(mocks.appendAudit).toHaveBeenCalledTimes(1);
    const [, , event, payload] = mocks.appendAudit.mock.calls[0]!;
    expect(event).toBe("driver_finance.driver_settlement.voided");
    expect(payload).toMatchObject({
      resource_id: SETTLEMENT,
      header_already_cancelled: true,
      settlement_lines_voided: ["58ed998c-3569-41ed-9211-1d2dbac5a158", "b5cff21e-92cc-4101-9176-2964cf953432"],
      driver_bills_released: ["e5cfbcd5-af20-488e-af2b-f252cc6e066e"],
    });
  });

  it("writes the missing void audit even when no child was left live (the 443.167 shells with zero lines)", async () => {
    const { client } = fakeClient({ status: "cancelled", liveLineIds: [], linkedOpenBillIds: [], priorVoidAudits: 0 });
    const res = await executeVoidCancel("driver_settlement", ctx(client));
    expect(res.kind).toBe("ok");
    expect(mocks.appendAudit).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a fully cascaded, already-audited cancelled settlement is already_done and writes nothing new", async () => {
    const { client } = fakeClient({ status: "cancelled", liveLineIds: [], linkedOpenBillIds: [], priorVoidAudits: 1 });
    const res = await executeVoidCancel("driver_settlement", ctx(client));
    expect(res.kind).toBe("already_done");
    expect(mocks.appendAudit).not.toHaveBeenCalled();
  });

  it("a fresh void still cascades lines BEFORE the header flip and writes one audit naming the voided lines", async () => {
    const { client, calls } = fakeClient({
      status: "closed",
      liveLineIds: ["4db01ee2-5404-45e4-bf6f-0ec11e5b3c29"],
      linkedOpenBillIds: [],
      priorVoidAudits: 0,
    });
    const res = await executeVoidCancel("driver_settlement", ctx(client));
    expect(res.kind).toBe("ok");
    const lineIdx = calls.findIndex((c) => c.sql.includes("UPDATE driver_finance.settlement_lines"));
    const flipIdx = calls.findIndex((c) => c.sql.includes("UPDATE driver_finance.driver_settlements"));
    expect(lineIdx).toBeGreaterThan(-1);
    expect(flipIdx).toBeGreaterThan(lineIdx);
    expect(mocks.appendAudit).toHaveBeenCalledTimes(1);
    expect(mocks.appendAudit.mock.calls[0]![3]).toMatchObject({ settlement_lines_voided: ["4db01ee2-5404-45e4-bf6f-0ec11e5b3c29"] });
  });

  it("a paid settlement is still refused (money moves only through the reversal engine)", async () => {
    const { client } = fakeClient({ status: "paid", liveLineIds: ["x"], linkedOpenBillIds: [], priorVoidAudits: 0 });
    const res = await executeVoidCancel("driver_settlement", ctx(client));
    expect(res.kind).toBe("not_completable");
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  // LEAD 443.192 13:25Z item 3 — fail-old: before the fix the cascade never touched driver_reimbursements, so the 8 unpaid
  // reimbursements on cancelled P-0085/0090/0091/0092 stayed 'settled' against a dead settlement, and a fully audited
  // cancelled header returned already_done without releasing them.
  it("releases unpaid reimbursements settled against the cancelled settlement and names them in the void audit", async () => {
    const { client, calls } = fakeClient({
      status: "cancelled",
      liveLineIds: [],
      linkedOpenBillIds: [],
      priorVoidAudits: 1,
      settledReimbursementIds: ["fdf68d29-0000-4000-8000-000000000001", "c53079a2-0000-4000-8000-000000000002"],
    });
    const res = await executeVoidCancel("driver_settlement", ctx(client));
    // a prior void audit exists, but releasing reimbursements is a real write — not already_done
    expect(res.kind).toBe("ok");
    const upd = calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_reimbursements"));
    expect(upd).toBeDefined();
    // back to the pre-settlement state the settlement writers select on
    expect(upd!.sql).toMatch(/WHEN r\.status = 'settled' THEN 'pending'/);
    expect(upd!.sql).toMatch(/applied_to_settlement_id = NULL/);
    expect(upd!.sql).toMatch(/settlement_line_id = NULL/);
    // never a paid / voided reimbursement
    expect(upd!.sql).toMatch(/r\.paid_at IS NULL/);
    expect(upd!.sql).toMatch(/r\.voided_at IS NULL/);
    expect(upd!.sql).toMatch(/r\.status IN \('settled', 'pending'\)/);
    expect(upd!.values).toEqual([SETTLEMENT, COMPANY]);
    expect(mocks.appendAudit).toHaveBeenCalledTimes(1);
    expect(mocks.appendAudit.mock.calls[0]![3]).toMatchObject({
      header_already_cancelled: true,
      reimbursements_released: ["fdf68d29-0000-4000-8000-000000000001", "c53079a2-0000-4000-8000-000000000002"],
    });
  });

  it("a fresh void also releases the settlement's reimbursements and names them in its audit", async () => {
    const { client } = fakeClient({
      status: "closed",
      liveLineIds: ["4db01ee2-5404-45e4-bf6f-0ec11e5b3c29"],
      linkedOpenBillIds: [],
      priorVoidAudits: 0,
      settledReimbursementIds: ["6abbc20b-0000-4000-8000-000000000003"],
    });
    const res = await executeVoidCancel("driver_settlement", ctx(client));
    expect(res.kind).toBe("ok");
    expect(mocks.appendAudit.mock.calls[0]![3]).toMatchObject({ reimbursements_released: ["6abbc20b-0000-4000-8000-000000000003"] });
  });
});
