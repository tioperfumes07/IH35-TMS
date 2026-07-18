import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asOfToday, type ScheduleRow } from "./fixed-assets.math.js";

// G6-1 — financial "today" / day-boundary must be computed in the company timezone
// (America/Chicago), NOT UTC. `new Date().toISOString().slice(0,10)` yields the UTC calendar
// date, which after ~19:00 Central has already rolled to the next day — so an "as-of today"
// financial cutoff (aging, trial balance, depreciation-to-date) and a near-midnight transaction
// posting date both land on the WRONG financial day for this Central-time carrier.
//
// The fix routes every financial "today" default through companyBusinessDate() (lib/company-business-date).

describe("G6-1 financial today in company timezone — behavioral", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asOfToday cuts off at the Central business day, not the UTC day, near midnight", () => {
    // 2026-06-30T02:00:00Z === 2026-06-29 21:00 America/Chicago (CDT, UTC-5).
    // UTC calendar date = the 30th; the company business date = the 29th.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T02:00:00Z"));

    const rows: ScheduleRow[] = [
      {
        period_number: 1,
        period_date: "2026-06-29",
        depreciation_amount_cents: 1000,
        accumulated_to_date_cents: 1000,
        book_value_end_cents: 9000,
        method_snapshot: "straight_line",
      },
      {
        period_number: 2,
        period_date: "2026-06-30",
        depreciation_amount_cents: 1000,
        accumulated_to_date_cents: 2000,
        book_value_end_cents: 8000,
        method_snapshot: "straight_line",
      },
    ];

    const result = asOfToday(rows);

    // Central "today" is 2026-06-29 → include the 06-29 period, EXCLUDE the 06-30 period.
    // Under the old UTC bug "today" would be 06-30 and this would wrongly report 2000 / 8000.
    expect(result.depr_to_date_cents).toBe(1000);
    expect(result.book_value_now_cents).toBe(9000);
  });
});

// Static regression guard: every financial "today"/day-boundary default in accounting must go
// through companyBusinessDate() — the raw UTC anti-pattern must never come back.
describe("G6-1 static guard — no UTC financial 'today' in accounting date defaults", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const UTC_TODAY = "new Date().toISOString().slice(0, 10)";

  const guardedFiles = [
    "ar-aging.routes.ts",
    "ap-aging.routes.ts",
    "trial-balance.routes.ts",
    "balance-sheet.routes.ts",
    "profit-loss.routes.ts",
    "break-even.routes.ts",
    "fin20-aging.routes.ts",
    "fin20-aging.service.ts",
    "daily-recon.routes.ts",
    "statement-export.routes.ts",
    "finance-hub.service.ts",
    "revenue-recognition.routes.ts",
    "fixed-assets.math.ts",
    "void.service.ts",
    "invoices.routes.ts",
    "invoices.service.ts",
    "recurring.worker.ts",
    "role-home/accounting-home.service.ts",
    "escrow/service.ts",
    "amortization-posting/amortization-posting.service.ts",
    "vendor-credits.routes.ts",
    // 0091-g6-1 (remaining): the settlement reversal deduction JE entry_date must be the company
    // business date, never the UTC calendar day.
    "settlement-posting/settlement-bill-payment-posting.service.ts",
  ];

  for (const rel of guardedFiles) {
    it(`${rel} computes financial 'today' via companyBusinessDate, not UTC`, () => {
      const src = readFileSync(resolve(here, rel), "utf8");
      expect(src).not.toContain(UTC_TODAY);
      if (
        rel === "settlement-posting/settlement-bill-payment-posting.service.ts"
      ) {
        // The settlement orchestrator delegates date selection to the two canonical reversal services;
        // one transaction-scoped company date is passed through bill/payment + JE reversal helpers.
        expect(src).toContain("voidBillPaymentInClientTx");
        expect(src).toContain("voidBillInClientTx");
        expect(src).toContain("reverseJournalEntryNoFlip");
        expect(src).toContain("currentBusinessDate");
      } else {
        expect(src).toContain("companyBusinessDate");
      }
    });
  }
});
