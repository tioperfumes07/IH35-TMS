import { describe, expect, it, vi } from "vitest";
import {
  settlementDisplayIdFromLoadNumber,
  aggregateSettlementTotals,
  openLoadBookendedSettlement,
} from "../settlements-load-bookended.service.js";

describe("load-bookended settlements", () => {
  it("maps settlement display ids from load numbers", () => {
    expect(settlementDisplayIdFromLoadNumber("L-13518")).toBe("S-13518");
    expect(settlementDisplayIdFromLoadNumber("l-999")).toBe("S-999");
  });

  it("aggregates settlement totals from settlement_lines", async () => {
    const client = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM driver_finance.settlement_lines")) {
          return {
            rows: [{ earnings: "100.00", deductions: "10.00", reimbursements: "5.00" }],
          };
        }
        if (sql.includes("UPDATE driver_finance.driver_settlements")) {
          return { rows: [] };
        }
        throw new Error(`unexpected sql in test: ${sql}`);
      }),
    };

    const totals = await aggregateSettlementTotals(client as never, "00000000-0000-4000-8000-0000000000bb");
    expect(totals.gross_pay).toBe(100);
    expect(totals.deductions_total).toBe(10);
    expect(totals.reimbursements_total).toBe(5);
    expect(totals.net_pay).toBe(95);
  });

  it("ACCT-F5619 — folds dispute_adjustment into the same bucket as reimbursement (no longer falls through ELSE 0)", async () => {
    let capturedSql = "";
    const client = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("COALESCE(SUM(CASE WHEN line_type")) {
          capturedSql = sql;
          return { rows: [{ earnings: "100.00", deductions: "10.00", reimbursements: "5.00" }] };
        }
        if (sql.includes("UPDATE driver_finance.driver_settlements") || sql.includes("WITH covered AS")) {
          return { rows: [] };
        }
        throw new Error(`unexpected sql in test: ${sql}`);
      }),
    };

    await aggregateSettlementTotals(client as never, "00000000-0000-4000-8000-0000000000bb");
    expect(capturedSql).toMatch(
      /CASE WHEN line_type IN \('reimbursement', 'dispute_adjustment'\) THEN amount ELSE 0 END/
    );
  });

  // MEGA-TOUR-RULING (CC-1, 2026-09-06, docs/bus/OUTBOX-CC-1.md) regression cases for
  // openLoadBookendedSettlement's reuse-detection query, per the ruling's own instruction to add
  // "cases for a cancelled-anchor/live-lines settlement and a cancelled-anchor/zero-lines
  // settlement". The DB is mocked (no live Postgres here), so these tests prove two things: (1) the
  // reuse query's TEXT actually carries the widened settlement_lines/driver_bills OR-EXISTS clause
  // (structural — a regression here means the widening was reverted or never shipped), and (2) the
  // function's control flow correctly reuses a settlement the mock reports as found, and correctly
  // falls through to INSERT a new one when the mock reports none. Real SQL semantics (does Postgres
  // itself resolve the join to the right rows) are proven live against Neon in the DELIVER-SEED-FINISH
  // re-run, not here.
  const DRIVER_ID = "00000000-0000-4000-8000-0000000000d1";
  const OPCO_ID = "00000000-0000-4000-8000-0000000000c1";
  const FIRST_LOAD_ID = "00000000-0000-4000-8000-0000000000f1";

  function makeLoadRow() {
    return {
      id: FIRST_LOAD_ID,
      load_number: "L-99001",
      assigned_primary_driver_id: DRIVER_ID,
      assigned_secondary_driver_id: null,
      operating_company_id: OPCO_ID,
      is_sample_data: false,
    };
  }

  it("MEGA-TOUR-RULING — reuse query text carries the widened settlement_lines/driver_bills OR-EXISTS clause", async () => {
    let capturedReuseSql = "";
    const client = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM mdata.loads") && sql.includes("WHERE id = $1")) {
          return { rows: [makeLoadRow()] };
        }
        if (sql.includes("FROM mdata.load_stops")) {
          return { rows: [{ pickup_at: "2026-08-07T00:00:00.000Z" }] };
        }
        if (sql.includes("FROM driver_finance.driver_settlements")) {
          capturedReuseSql = sql;
          return { rows: [{ id: "s-reused", display_id: "S-99000" }] };
        }
        throw new Error(`unexpected sql in test: ${sql}`);
      }),
    };

    await openLoadBookendedSettlement(client as never, {
      driverId: DRIVER_ID,
      operatingCompanyId: OPCO_ID,
      firstLoadId: FIRST_LOAD_ID,
      actorUserId: "00000000-0000-4000-8000-0000000000a1",
    });

    expect(capturedReuseSql).toMatch(/FROM driver_finance\.settlement_lines sl/);
    expect(capturedReuseSql).toMatch(/LEFT JOIN driver_finance\.driver_bills db ON db\.id = sl\.source_driver_bill_id/);
    expect(capturedReuseSql).toMatch(/sl\.is_active = true/);
    expect(capturedReuseSql).toMatch(/ll\.status::text <> 'cancelled'/);
  });

  it("MEGA-TOUR-RULING — cancelled-anchor/live-lines: reuse query reports a match, settlement is REUSED (no INSERT)", async () => {
    const client = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM mdata.loads") && sql.includes("WHERE id = $1")) {
          return { rows: [makeLoadRow()] };
        }
        if (sql.includes("FROM mdata.load_stops")) {
          return { rows: [{ pickup_at: "2026-08-07T00:00:00.000Z" }] };
        }
        if (sql.includes("FROM driver_finance.driver_settlements")) {
          // Simulates: first_load_id's own load IS cancelled, but the widened OR-EXISTS finds a
          // live load via settlement_lines -> driver_bills, so the DB-side query would return this
          // row instead of nothing.
          return { rows: [{ id: "s-reused-cancelled-anchor", display_id: "S-13642" }] };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_settlements")) {
          throw new Error("must not INSERT when a reusable settlement exists");
        }
        throw new Error(`unexpected sql in test: ${sql}`);
      }),
    };

    const result = await openLoadBookendedSettlement(client as never, {
      driverId: DRIVER_ID,
      operatingCompanyId: OPCO_ID,
      firstLoadId: FIRST_LOAD_ID,
      actorUserId: "00000000-0000-4000-8000-0000000000a1",
    });

    expect(result).toEqual({ settlementId: "s-reused-cancelled-anchor", settlementNumber: "S-13642" });
  });

  it("MEGA-TOUR-RULING — cancelled-anchor/zero-lines: reuse query reports no match, a NEW settlement is inserted", async () => {
    const client = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM mdata.loads") && sql.includes("WHERE id = $1")) {
          return { rows: [makeLoadRow()] };
        }
        if (sql.includes("FROM mdata.load_stops")) {
          return { rows: [{ pickup_at: "2026-08-07T00:00:00.000Z" }] };
        }
        if (sql.includes("FROM driver_finance.driver_settlements")) {
          // Simulates S-13651/S-13653: first_load_id's own load is cancelled AND there are zero
          // settlement_lines to attach — genuinely nothing reusable, per the ruling's own carve-out.
          return { rows: [] };
        }
        if (sql.includes("next_settlement_display_id")) {
          return { rows: [{ next_id: "S-2026-99001" }] };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_settlements")) {
          return { rows: [{ id: "s-new", display_id: "S-2026-99001" }] };
        }
        if (sql.includes("audit.append_event") || sql.includes("INSERT INTO outbox.events")) {
          return { rows: [] };
        }
        throw new Error(`unexpected sql in test: ${sql}`);
      }),
    };

    const result = await openLoadBookendedSettlement(client as never, {
      driverId: DRIVER_ID,
      operatingCompanyId: OPCO_ID,
      firstLoadId: FIRST_LOAD_ID,
      actorUserId: "00000000-0000-4000-8000-0000000000a1",
    });

    expect(result).toEqual({ settlementId: "s-new", settlementNumber: "S-2026-99001" });
  });

  it("OWNER-NUMBERING-RULE — new settlement display_id is generated, never S-<load_number>", async () => {
    // The load number is L-99001. The old bug produced S-99001 (settlement = load number).
    // The fix calls next_settlement_display_id which returns an independent S-YYYY-NNNN sequence.
    // This test asserts the generated display_id is NOT S-99001 (the load-number-derived form)
    // and IS the value from next_settlement_display_id (S-2026-0042 in this mock).
    const client = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM mdata.loads") && sql.includes("WHERE id = $1")) {
          return { rows: [makeLoadRow()] };
        }
        if (sql.includes("FROM mdata.load_stops")) {
          return { rows: [{ pickup_at: "2026-08-07T00:00:00.000Z" }] };
        }
        if (sql.includes("FROM driver_finance.driver_settlements")) {
          return { rows: [] };
        }
        if (sql.includes("next_settlement_display_id")) {
          return { rows: [{ next_id: "S-2026-0042" }] };
        }
        if (sql.includes("INSERT INTO driver_finance.driver_settlements")) {
          return { rows: [{ id: "s-new-42", display_id: "S-2026-0042" }] };
        }
        if (sql.includes("audit.append_event") || sql.includes("INSERT INTO outbox.events")) {
          return { rows: [] };
        }
        throw new Error(`unexpected sql in test: ${sql}`);
      }),
    };

    const result = await openLoadBookendedSettlement(client as never, {
      driverId: DRIVER_ID,
      operatingCompanyId: OPCO_ID,
      firstLoadId: FIRST_LOAD_ID,
      actorUserId: "00000000-0000-4000-8000-0000000000a1",
    });

    // The settlement number must NOT be the load-number-derived form (S-99001).
    expect(result.settlementNumber).not.toBe("S-99001");
    // The settlement number must NOT be S- prefixed load number in any form.
    expect(result.settlementNumber).not.toBe(`S-${makeLoadRow().load_number.replace(/^L-/, "")}`);
    // The settlement number MUST be the generated sequence value.
    expect(result.settlementNumber).toBe("S-2026-0042");
  });
});
