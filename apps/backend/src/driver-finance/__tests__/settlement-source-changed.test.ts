// LEAD 443.215 extension — a second source for settlement 5842 with a different TOTAL DUE is DETECTED. AlwaysTrack re-printed
// 5842 on 10-21 (TOTAL DUE 1,645.90 → 1,726.40: + layover 50.00, + 2 LOVES scale tickets 15.25) and the app said nothing.
// Fails on origin/main: there is no source fingerprint / source check at all (silent).
import { describe, expect, it, vi } from "vitest";

vi.mock("../feed-gate/feed-gate.service.js", () => ({ openOrGetIntakeOnClient: vi.fn(async () => ({ id: "intake-1", last_run_no: 3 })) }));

const SOURCE_1021 = {
 "settlement_no": "5842",
 "period_start": "2026-10-06",
 "period_end": "2026-10-16",
 "pdf_driver_net_cents": 172640,
 "loads": [
  {
   "load_number": "13664",
   "miles_shortest": 1820.1,
   "empty_miles": 0,
   "line_haul_rate_cents": 45,
   "empty_rate_cents": null
  },
  {
   "load_number": "13669",
   "miles_shortest": 1503.2,
   "empty_miles": 0,
   "line_haul_rate_cents": 45,
   "empty_rate_cents": null
  },
  {
   "load_number": "13679",
   "miles_shortest": 315.7,
   "empty_miles": 96.3,
   "line_haul_rate_cents": 45,
   "empty_rate_cents": 45
  }
 ],
 "additional_pay": [
  {
   "description": "Driver Pay-Layover-Estancia 10 y 11 de Octubre",
   "amount_cents": 5000,
   "load_number": "13669"
  }
 ],
 "expenses": [
  {
   "description": "LOVES Driver Reimbursement-TPE-Scale Expense",
   "amount_cents": 1525,
   "load_number": "13664",
   "is_reimbursable": true,
   "vendor_document_number": null
  },
  {
   "description": "TRAVEL CENTER OF AMERICA Bridge & Toll Expenses:OTR-Parking Expense",
   "amount_cents": 5000,
   "load_number": "13669",
   "is_reimbursable": true,
   "vendor_document_number": null
  },
  {
   "description": "LOVES Driver Reimbursement-TPE-Scale Expense",
   "amount_cents": 1525,
   "load_number": "13669",
   "is_reimbursable": true,
   "vendor_document_number": null
  }
 ],
 "deductions": [
  {
   "description": "Admin fee - GAS",
   "amount_cents": 1000,
   "load_number": "13679"
  }
 ],
 "escrow": [
  {
   "description": "Driver-Escrow For Claims - Driver-Escrow For Claims",
   "amount_cents": 2500,
   "load_number": "13664"
  },
  {
   "description": "Driver-Escrow For Claims - Driver-Escrow For Claims",
   "amount_cents": 2500,
   "load_number": "13669"
  },
  {
   "description": "Driver-Escrow For Claims - Driver-Escrow For Claims",
   "amount_cents": 2500,
   "load_number": "13679"
  }
 ],
 "fuel_purchases": [
  {
   "invoice": "F1",
   "receipt_cents": 46029,
   "load_number": "13664",
   "fuel_type": "diesel",
   "card": "relay"
  },
  {
   "invoice": "F2",
   "receipt_cents": 72213,
   "load_number": "13664",
   "fuel_type": "diesel",
   "card": "relay"
  },
  {
   "invoice": "F3",
   "receipt_cents": 85021,
   "load_number": "13664",
   "fuel_type": "diesel",
   "card": "relay"
  },
  {
   "invoice": "F4",
   "receipt_cents": 66000,
   "load_number": "13669",
   "fuel_type": "diesel",
   "card": "relay"
  },
  {
   "invoice": "F5",
   "receipt_cents": 79189,
   "load_number": "13669",
   "fuel_type": "diesel",
   "card": "relay"
  },
  {
   "invoice": "F6",
   "receipt_cents": 79592,
   "load_number": "13669",
   "fuel_type": "diesel",
   "card": "relay"
  }
 ]
};
const SOURCE_1016 = {
  ...SOURCE_1021,
  pdf_driver_net_cents: 164590,
  additional_pay: [],
  expenses: SOURCE_1021.expenses.filter((e: { description: string }) => !/scale/i.test(e.description)),
};

describe("443.215 — a changed settlement source is flagged, an unchanged one is 'already posted'", () => {
  it("10-16 posted, 10-21 arrives: source changed — TOTAL DUE + the three new lines, exactly", async () => {
    const mod = (await import("../settlement-source-fingerprint.js")) as Record<string, any>;
    expect(typeof mod.fingerprintFromDraft).toBe("function");
    const diff = mod.diffSourceFingerprints(mod.fingerprintFromDraft(SOURCE_1016), mod.fingerprintFromDraft(SOURCE_1021));
    expect(mod.sourceDiffIsEmpty(diff)).toBe(false);
    expect(diff.changed).toEqual([{ field: "total_due_cents", before: 164590, after: 172640 }]);
    expect(diff.removed).toEqual([]);
    expect(diff.added.map((l: { kind: string; load: string; amount_cents: number }) => `${l.kind}|${l.load}|${l.amount_cents}`).sort())
      .toEqual(["additional_pay|13669|5000", "reimbursement|13664|1525", "reimbursement|13669|1525"]);
    expect(mod.describeSourceDiff(diff)[0]).toBe("total_due: 1645.90 → 1726.40");
  });

  it("the same source again: already posted (no diff)", async () => {
    const mod = (await import("../settlement-source-fingerprint.js")) as Record<string, any>;
    const fp = mod.fingerprintFromDraft(SOURCE_1021);
    expect(mod.sourceDiffIsEmpty(mod.diffSourceFingerprints(fp, mod.fingerprintFromDraft(SOURCE_1021)))).toBe(true);
  });

  it("the engine records a FAILING source check (source changed: repost needed) on the live settlement's intake", async () => {
    const mod = (await import("../settlement-source-fingerprint.js")) as Record<string, any>;
    const inserted: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, v: unknown[] = []) => {
        if (/FROM driver_finance\.driver_settlements/.test(sql) && /source_fingerprint/.test(sql))
          return { rows: [{ id: "s-0101", display_id: "P-0101", source_fingerprint: mod.fingerprintFromDraft(SOURCE_1016) }] };
        if (/INSERT INTO driver_finance\.feed_intake_checks/.test(sql)) { inserted.push(v); return { rows: [] }; }
        return { rows: [] };
      }),
    };
    const v = await mod.checkSettlementSourceOnClient(client, { operatingCompanyId: "co", draft: SOURCE_1021, actorUserId: "u" });
    expect(v.verdict).toBe("source_changed");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]![3]).toBe("fail");
    expect(inserted[0]![6]).toBe("source changed: repost needed");
  });
});
