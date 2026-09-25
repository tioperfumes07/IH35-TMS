import { describe, expect, it, vi } from "vitest";

import { isLoadTourOpen, loadIdsForSettlement } from "../tour-open-gate.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "22222222-2222-4222-8222-222222222222";
const SETTLEMENT_ID = "66666666-6666-4666-8666-666666666666";

type Row = { settlement_status: string | null };

/**
 * R-169 fix 3 (owner, measured live on settlement 5812: TOTAL DUE -50.00, salary 0) — a zero-pay
 * settlement never earns a driver_finance.settlement_lines row, so the settlement_lines path alone
 * always reports the tour open. driver_bills.settled_in_settlement_id is the fix: stamped directly
 * on the bill regardless of whether the settlement produced any pay line.
 */
function fakeClient(opts: { settlementLinesStatus: string | null; settledInSettlementStatus: string | null }) {
  const client = {
    query: vi.fn(async (sql: string) => {
      // The function issues one UNION ALL query; a real pg client returns both branches' rows
      // together. Emulate that by returning whichever rows are non-null from each half.
      const rows: Row[] = [];
      if (opts.settlementLinesStatus !== undefined) rows.push({ settlement_status: opts.settlementLinesStatus });
      if (opts.settledInSettlementStatus !== null) rows.push({ settlement_status: opts.settledInSettlementStatus });
      void sql;
      return { rows };
    }),
  };
  return client;
}

describe("R-169 fix 3 — a zero-pay settlement still closes its loads' tours", () => {
  it("open: no settlement resolved via either path (tour not yet assembled)", async () => {
    const client = fakeClient({ settlementLinesStatus: null, settledInSettlementStatus: null });
    await expect(isLoadTourOpen(client as never, OPCO, LOAD_ID)).resolves.toBe(true);
  });

  it("open: settlement_lines path resolves a non-terminal status, settled_in_settlement_id resolves nothing", async () => {
    const client = fakeClient({ settlementLinesStatus: "draft", settledInSettlementStatus: null });
    await expect(isLoadTourOpen(client as never, OPCO, LOAD_ID)).resolves.toBe(true);
  });

  it("CLOSED: settlement_lines path finds nothing (zero-pay, no pay line ever written) but settled_in_settlement_id resolves a closed status -- the exact 5812 shape", async () => {
    const client = fakeClient({ settlementLinesStatus: null, settledInSettlementStatus: "closed" });
    await expect(isLoadTourOpen(client as never, OPCO, LOAD_ID)).resolves.toBe(false);
  });

  it("closed: the settlement_lines path alone still closes it (unchanged, pre-existing behavior)", async () => {
    const client = fakeClient({ settlementLinesStatus: "closed", settledInSettlementStatus: null });
    await expect(isLoadTourOpen(client as never, OPCO, LOAD_ID)).resolves.toBe(false);
  });
});

/**
 * Found live while wiring up 5812's actual postHeldDocumentsForClosedTour call (the Lead's
 * follow-on order, 2026-09-25 02:15 PM CT) — loadIdsForSettlement has the SAME zero-pay blind spot
 * fix 3 above just closed in isLoadTourOpen, one level up: for a zero-pay settlement it used to
 * resolve an EMPTY load list (no settlement_lines row to join through), so
 * postHeldDocumentsForClosedTour would silently no-op even after isLoadTourOpen itself said the
 * tour was closed. Widened identically: also resolve via driver_bills.settled_in_settlement_id.
 */
describe("loadIdsForSettlement — the same zero-pay blind spot, one level up", () => {
  it("the query text UNIONs a settled_in_settlement_id path alongside settlement_lines (structural regression check, since a behavior-only fake client can't distinguish the two paths)", async () => {
    let capturedSql = "";
    const client = { query: vi.fn(async (sql: string) => { capturedSql = sql; return { rows: [] }; }) };
    await loadIdsForSettlement(client as never, OPCO, SETTLEMENT_ID);
    expect(capturedSql).toMatch(/settlement_lines/);
    expect(capturedSql).toMatch(/settled_in_settlement_id/);
    expect(capturedSql).toMatch(/UNION/);
  });

  it("resolves a load via settled_in_settlement_id alone -- the 5812 shape (no settlement_lines row)", async () => {
    const client = { query: vi.fn(async () => ({ rows: [{ load_id: LOAD_ID }] })) };
    await expect(loadIdsForSettlement(client as never, OPCO, SETTLEMENT_ID)).resolves.toEqual([LOAD_ID]);
  });

  it("empty when neither path resolves anything", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(loadIdsForSettlement(client as never, OPCO, SETTLEMENT_ID)).resolves.toEqual([]);
  });
});
