import { describe, expect, it, vi } from "vitest";

import { isLoadTourOpen } from "../tour-open-gate.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "22222222-2222-4222-8222-222222222222";

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
