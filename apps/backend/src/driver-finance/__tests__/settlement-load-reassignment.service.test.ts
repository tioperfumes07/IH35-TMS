import { describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../settlements-load-bookended.service.js", () => ({
  aggregateSettlementTotals: vi.fn().mockResolvedValue({
    gross_pay: 0,
    deductions_total: 0,
    reimbursements_total: 0,
    net_pay: 0,
    escrow_contribution_total: 0,
  }),
}));
vi.mock("../settlement-source-document-ref.service.js", () => ({
  setSettlementSourceDocumentRef: vi.fn().mockResolvedValue({ id: "new-settlement", display_id: "S-2026-9999", source_document_ref: "5786" }),
}));
vi.mock("../settlement-display-id.js", () => ({
  allocateSettlementDisplayId: vi.fn().mockResolvedValue("S-2026-9999"),
}));

import { aggregateSettlementTotals } from "../settlements-load-bookended.service.js";
import { setSettlementSourceDocumentRef } from "../settlement-source-document-ref.service.js";
import {
  createBareSettlementForDocument,
  reassignLoadToSettlementInClientTx,
  recomputeSettlementHeader,
} from "../settlement-load-reassignment.service.js";

const IDS = {
  company: "oc000000-0000-0000-0000-000000000001",
  load: "ld000000-0000-0000-0000-000000000001",
  from: "st000000-0000-0000-0000-00000000000a",
  to: "st000000-0000-0000-0000-00000000000b",
  actor: "us000000-0000-0000-0000-000000000001",
};

function makeMockClient(opts: { loadFromSettlement?: string | null; targetExists?: boolean } = {}) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const rowCounts: Record<string, number> = {
    settlement_lines: 3,
    driver_settlement_deductions: 1,
    driver_reimbursements: 1,
    driver_bills: 2,
  };
  const fromSettlement = "loadFromSettlement" in opts ? opts.loadFromSettlement : IDS.from;
  const client = {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
      calls.push({ sql, values });
      if (sql.includes("SELECT count(*) AS n FROM driver_finance.settlement_lines")) {
        // Report "has active lines" so recomputeSettlementHeader takes the settlement_lines path
        // (aggregateSettlementTotals is mocked below) -- the driver_bills_direct fallback path has
        // its own dedicated coverage in recomputeSettlementHeader's own test block.
        return { rows: [{ n: "1" }] as T[], rowCount: 1 };
      }
      if (sql.includes("SELECT presettlement_link_id FROM mdata.loads")) {
        return {
          rows: [{ presettlement_link_id: fromSettlement }] as T[],
          rowCount: 1,
        };
      }
      if (sql.includes("SELECT id FROM driver_finance.driver_settlements WHERE id")) {
        const exists = opts.targetExists ?? true;
        return { rows: (exists ? [{ id: IDS.to }] : []) as T[], rowCount: exists ? 1 : 0 };
      }
      if (sql.includes("UPDATE mdata.loads SET presettlement_link_id")) return { rows: [] as T[], rowCount: 1 };
      if (sql.includes("UPDATE driver_finance.settlement_lines")) return { rows: [] as T[], rowCount: rowCounts.settlement_lines };
      if (sql.includes("UPDATE driver_finance.driver_settlement_deductions")) return { rows: [] as T[], rowCount: rowCounts.driver_settlement_deductions };
      if (sql.includes("UPDATE driver_finance.driver_reimbursements")) return { rows: [] as T[], rowCount: rowCounts.driver_reimbursements };
      if (sql.includes("UPDATE driver_finance.driver_bills")) return { rows: [] as T[], rowCount: rowCounts.driver_bills };
      if (sql.includes("UPDATE driver_finance.driver_settlements") && sql.includes("first_load_id = CASE")) return { rows: [] as T[], rowCount: 1 };
      if (sql.includes("INSERT INTO driver_finance.driver_settlements")) return { rows: [{ id: IDS.to }] as T[], rowCount: 1 };
      return { rows: [] as T[], rowCount: 0 };
    },
  };
  return { client, calls };
}

describe("reassignLoadToSettlementInClientTx", () => {
  it("moves settlement_lines, deductions, reimbursements, and bills from the source to the target settlement", async () => {
    const { client, calls } = makeMockClient();
    const result = await reassignLoadToSettlementInClientTx(client, {
      operating_company_id: IDS.company,
      load_id: IDS.load,
      target_settlement_id: IDS.to,
      actor_user_id: IDS.actor,
      reason: "test move",
    });
    expect(result).toEqual({
      kind: "ok",
      from_settlement_id: IDS.from,
      to_settlement_id: IDS.to,
      moved_settlement_lines: 3,
      moved_deductions: 1,
      moved_reimbursements: 1,
      moved_bills: 2,
      from_recompute_method: "settlement_lines",
      to_recompute_method: "settlement_lines",
    });
    // the canonical pointer is updated.
    expect(calls.some((c) => c.sql.includes("UPDATE mdata.loads SET presettlement_link_id"))).toBe(true);
    // both settlements get their headers recomputed via the ONE existing rollup -- no new GL math.
    expect(vi.mocked(aggregateSettlementTotals)).toHaveBeenCalledWith(client, IDS.from, IDS.company);
    expect(vi.mocked(aggregateSettlementTotals)).toHaveBeenCalledWith(client, IDS.to, IDS.company);
  });

  it("clears the source settlement's bookend columns when the moved load was its first/last load (the aggregateSettlementTotals COALESCE gap)", async () => {
    const { client, calls } = makeMockClient();
    await reassignLoadToSettlementInClientTx(client, {
      operating_company_id: IDS.company,
      load_id: IDS.load,
      target_settlement_id: IDS.to,
      actor_user_id: IDS.actor,
      reason: "test move",
    });
    const bookendClear = calls.find((c) => c.sql.includes("first_load_id = CASE"));
    expect(bookendClear).toBeDefined();
    expect(bookendClear!.sql).toMatch(/last_load_id = CASE/);
  });

  it("is a no-op guard when the load is already on the target settlement", async () => {
    const { client } = makeMockClient({ loadFromSettlement: IDS.to });
    const result = await reassignLoadToSettlementInClientTx(client, {
      operating_company_id: IDS.company,
      load_id: IDS.load,
      target_settlement_id: IDS.to,
      actor_user_id: IDS.actor,
      reason: "test move",
    });
    expect(result).toEqual({ kind: "already_on_target" });
  });

  it("returns target_settlement_not_found instead of writing anything when the target does not exist", async () => {
    const { client, calls } = makeMockClient({ targetExists: false });
    const result = await reassignLoadToSettlementInClientTx(client, {
      operating_company_id: IDS.company,
      load_id: IDS.load,
      target_settlement_id: IDS.to,
      actor_user_id: IDS.actor,
      reason: "test move",
    });
    expect(result).toEqual({ kind: "target_settlement_not_found" });
    expect(calls.some((c) => c.sql.includes("UPDATE mdata.loads SET presettlement_link_id"))).toBe(false);
  });

  it("handles a load with no prior settlement (from_settlement_id null) by skipping the source-side moves entirely", async () => {
    const { client, calls } = makeMockClient({ loadFromSettlement: null });
    const result = await reassignLoadToSettlementInClientTx(client, {
      operating_company_id: IDS.company,
      load_id: IDS.load,
      target_settlement_id: IDS.to,
      actor_user_id: IDS.actor,
      reason: "test move",
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.from_settlement_id).toBeNull();
      // nothing to move at the line/deduction/reimbursement level when there was no source.
      expect(result.moved_settlement_lines).toBe(0);
      expect(result.moved_deductions).toBe(0);
      expect(result.moved_reimbursements).toBe(0);
    }
    expect(calls.some((c) => c.sql.includes("first_load_id = CASE"))).toBe(false);
    expect(vi.mocked(aggregateSettlementTotals)).toHaveBeenCalledWith(client, IDS.to, IDS.company);
    expect(vi.mocked(aggregateSettlementTotals)).not.toHaveBeenCalledWith(client, null, IDS.company);
  });
});

describe("recomputeSettlementHeader", () => {
  // BRANCH-REHEARSAL FINDING (this session): live measurement found 100% of 'cancelled' and 'open'
  // driver_finance.driver_settlements rows carry ZERO active settlement_lines -- their net_pay was
  // written directly from driver_bills by a different poster. aggregateSettlementTotals must NOT be
  // called unconditionally, or it silently zeros out a real historical net_pay.
  it("calls the canonical aggregateSettlementTotals when the settlement has active settlement_lines", async () => {
    const calls: { sql: string; values?: unknown[] }[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        if (sql.includes("SELECT count(*) AS n FROM driver_finance.settlement_lines")) {
          return { rows: [{ n: "3" }] as T[], rowCount: 1 };
        }
        return { rows: [] as T[], rowCount: 0 };
      },
    };
    const result = await recomputeSettlementHeader(client, IDS.from, IDS.company);
    expect(result).toEqual({ method: "settlement_lines" });
    expect(vi.mocked(aggregateSettlementTotals)).toHaveBeenCalledWith(client, IDS.from, IDS.company);
    expect(calls.some((c) => c.sql.includes("UPDATE driver_finance.driver_settlements") && c.sql.includes("gross_pay"))).toBe(false);
  });

  it("falls back to a direct driver_bills/deductions/reimbursements sum (mirroring the bill-payment poster's own formula) when there are zero active settlement_lines, and writes the header directly", async () => {
    vi.mocked(aggregateSettlementTotals).mockClear();
    const calls: { sql: string; values?: unknown[] }[] = [];
    const client = {
      async query<T = Record<string, unknown>>(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        if (sql.includes("SELECT count(*) AS n FROM driver_finance.settlement_lines")) {
          return { rows: [{ n: "0" }] as T[], rowCount: 1 };
        }
        if (sql.includes("gross_cents")) {
          return { rows: [{ gross_cents: "185245", deductions_cents: "24500", reimbursements_cents: "0" }] as T[], rowCount: 1 };
        }
        return { rows: [] as T[], rowCount: 1 };
      },
    };
    const result = await recomputeSettlementHeader(client, IDS.from, IDS.company);
    expect(result).toEqual({ method: "driver_bills_direct" });
    expect(vi.mocked(aggregateSettlementTotals)).not.toHaveBeenCalled();
    const headerWrite = calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_settlements") && c.sql.includes("gross_pay"));
    expect(headerWrite).toBeDefined();
    // 1852.45 - 245.00 + 0 = 1607.45 -- the exact live figure this rehearsal cross-checked.
    expect(headerWrite!.values).toEqual([IDS.from, "1852.45", "245.00", "0.00", "1607.45", IDS.company]);
  });
});

describe("createBareSettlementForDocument", () => {
  it("mints a new settlement via the existing display-id allocator and stamps the real source_document_ref via the existing setter", async () => {
    const { client } = makeMockClient();
    const result = await createBareSettlementForDocument(client, {
      operating_company_id: IDS.company,
      driver_id: "dr000000-0000-0000-0000-000000000001",
      period_start: "2026-08-26",
      period_end: "2026-09-01",
      source_document_ref: "5786",
      actor_user_id: IDS.actor,
      is_sample_data: false,
      status: "closed",
    });
    expect(result).toEqual({ settlement_id: IDS.to, display_id: "S-2026-9999" });
    expect(vi.mocked(setSettlementSourceDocumentRef)).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ settlementId: IDS.to, sourceDocumentRef: "5786" })
    );
  });
});
