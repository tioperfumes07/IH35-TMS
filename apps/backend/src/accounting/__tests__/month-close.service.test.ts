import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const query = vi.fn();
  return {
    query,
    withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    appendCrudAudit: vi.fn(async () => undefined),
    insertRetainedEarningsClosingJournalIfNeeded: vi.fn(async () => "je-retained-1"),
    writePeriodCashBasisSnapshotAtClose: vi.fn(async () => undefined),
    // ACCT-F5656 — default ON so existing tests (about checklist/lock logic, not the money-control
    // gate itself) keep exercising lockMonthClose's real logic; the dedicated gate test below
    // overrides this to false.
    isEnabled: vi.fn(async () => true),
  };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mocked.withCurrentUser,
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mocked.appendCrudAudit,
}));

vi.mock("../period-close-retained-earnings.service.js", () => ({
  insertRetainedEarningsClosingJournalIfNeeded: mocked.insertRetainedEarningsClosingJournalIfNeeded,
}));

vi.mock("../cash-basis/period-close-snapshot.service.js", () => ({
  writePeriodCashBasisSnapshotAtClose: mocked.writePeriodCashBasisSnapshotAtClose,
}));

vi.mock("../../lib/feature-flags/service.js", () => ({
  isEnabled: mocked.isEnabled,
}));

import { getMonthCloseStatus, lockMonthClose } from "../month-close.service.js";

describe("month close service", () => {
  beforeEach(() => {
    mocked.query.mockReset();
    mocked.appendCrudAudit.mockClear();
    mocked.insertRetainedEarningsClosingJournalIfNeeded.mockClear();
    mocked.writePeriodCashBasisSnapshotAtClose.mockClear();
    mocked.isEnabled.mockReset();
    mocked.isEnabled.mockResolvedValue(true);
  });

  it("reports can_lock=false when checklist has pending items", async () => {
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.periods")) {
        return { rows: [{ id: "period-1", status: "open", period_start: "2026-05-01", period_end: "2026-05-31" }] };
      }
      if (sql.includes("WITH coverage AS")) {
        return {
          rows: [
            {
              bank_account_id: "bank-1",
              bank_account_name: "Main account",
              total_transactions: 10,
              covered_transactions: 9,
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoices")) return { rows: [{ overdue_count: 1 }] };
      if (sql.includes("FROM accounting.bills b")) return { rows: [{ overdue_count: 0 }] };
      if (sql.includes("FROM reports.ifta_filings")) return { rows: [{ ifta_filed: false }] };
      if (sql.includes("FROM accounting.journal_entries je")) return { rows: [{ count: 2 }] };
      return { rows: [] };
    });

    const status = await getMonthCloseStatus({
      userId: "11111111-1111-4111-8111-111111111111",
      operatingCompanyId: "22222222-2222-4222-8222-222222222222",
      period: "2026-05",
    });

    expect(status.can_lock).toBe(false);
    expect(status.bank_recon.complete).toBe(false);
    expect(status.bank_recon.accounts_pending).toHaveLength(1);
    expect(status.ar_aging_review.overdue_count).toBe(1);
    // ACCT-F52: May is mid-quarter (Q2) — nothing is due, so fuel_tax never blocks close on its own.
    expect(status.fuel_tax.ifta_filed).toBe(false);
    expect(status.fuel_tax.due_this_month).toBe(false);
    expect(status.fuel_tax.quarter_label).toBe("2026-Q2");
    expect(status.fuel_tax.complete).toBe(true);
  });

  it("ACCT-F52: blocks close on a quarter-end month when IFTA is not filed", async () => {
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.periods")) {
        return { rows: [{ id: "period-1", status: "open", period_start: "2026-06-01", period_end: "2026-06-30" }] };
      }
      if (sql.includes("WITH coverage AS")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) return { rows: [{ overdue_count: 0 }] };
      if (sql.includes("FROM accounting.bills b")) return { rows: [{ overdue_count: 0 }] };
      if (sql.includes("FROM reports.ifta_filings")) return { rows: [{ ifta_filed: false }] };
      if (sql.includes("FROM accounting.journal_entries je")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });

    const status = await getMonthCloseStatus({
      userId: "11111111-1111-4111-8111-111111111111",
      operatingCompanyId: "22222222-2222-4222-8222-222222222222",
      period: "2026-06",
    });

    expect(status.fuel_tax.quarter_label).toBe("2026-Q2");
    expect(status.fuel_tax.due_this_month).toBe(true);
    expect(status.fuel_tax.ifta_filed).toBe(false);
    expect(status.fuel_tax.complete).toBe(false);
    expect(status.can_lock).toBe(false);

    const fuelTaxQuery = mocked.query.mock.calls.find(([sql]) =>
      String(sql).includes("FROM reports.ifta_filings")
    );
    expect(fuelTaxQuery?.[1]).toEqual(["22222222-2222-4222-8222-222222222222", "2026-Q2"]);
  });

  it("ACCT-F52: allows close on a quarter-end month once IFTA is filed", async () => {
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.periods")) {
        return { rows: [{ id: "period-1", status: "open", period_start: "2026-06-01", period_end: "2026-06-30" }] };
      }
      if (sql.includes("WITH coverage AS")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) return { rows: [{ overdue_count: 0 }] };
      if (sql.includes("FROM accounting.bills b")) return { rows: [{ overdue_count: 0 }] };
      if (sql.includes("FROM reports.ifta_filings")) return { rows: [{ ifta_filed: true }] };
      if (sql.includes("FROM accounting.journal_entries je")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });

    const status = await getMonthCloseStatus({
      userId: "11111111-1111-4111-8111-111111111111",
      operatingCompanyId: "22222222-2222-4222-8222-222222222222",
      period: "2026-06",
    });

    expect(status.fuel_tax.complete).toBe(true);
    expect(status.can_lock).toBe(true);
  });

  it("rejects lock when checklist is incomplete", async () => {
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("FROM accounting.periods")) {
        return { rows: [{ id: "period-1", status: "open", period_start: "2026-05-01", period_end: "2026-05-31" }] };
      }
      if (sql.includes("WITH coverage AS")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) return { rows: [{ overdue_count: 1 }] };
      if (sql.includes("FROM accounting.bills b")) return { rows: [{ overdue_count: 0 }] };
      if (sql.includes("FROM reports.ifta_filings")) return { rows: [{ ifta_filed: true }] };
      if (sql.includes("FROM accounting.journal_entries je")) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });

    await expect(
      lockMonthClose({
        userId: "11111111-1111-4111-8111-111111111111",
        operatingCompanyId: "22222222-2222-4222-8222-222222222222",
        period: "2026-05",
      })
    ).rejects.toThrow("checklist_incomplete");
    expect(mocked.insertRetainedEarningsClosingJournalIfNeeded).not.toHaveBeenCalled();
  });

  it("ACCT-F5656: refuses lockMonthClose when MONEY_CONTROL_PERIOD_CLOSE_ENABLED is OFF for this entity, before ever touching the period row", async () => {
    mocked.isEnabled.mockResolvedValue(false);
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      // If the gate is bypassed, the checklist load would proceed to read the period row — asserting
      // this SQL was never reached is how this test proves the gate ran first, not just that the
      // error surfaced eventually.
      if (sql.includes("FROM accounting.periods")) {
        throw new Error("test setup: period-lookup SQL must not run when the money-control gate is OFF");
      }
      return { rows: [] };
    });

    await expect(
      lockMonthClose({
        userId: "11111111-1111-4111-8111-111111111111",
        operatingCompanyId: "22222222-2222-4222-8222-222222222222",
        period: "2026-05",
      })
    ).rejects.toThrow("period_close_disabled");
    expect(mocked.insertRetainedEarningsClosingJournalIfNeeded).not.toHaveBeenCalled();
  });

  it("allows can_lock when overdue A/R is acknowledged", async () => {
    mocked.query.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.periods")) {
        return { rows: [{ id: "period-1", status: "open", period_start: "2026-05-01", period_end: "2026-05-31" }] };
      }
      if (sql.includes("WITH coverage AS")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices")) return { rows: [{ overdue_count: 3 }] };
      if (sql.includes("FROM accounting.bills b")) return { rows: [{ overdue_count: 0 }] };
      if (sql.includes("FROM reports.ifta_filings")) return { rows: [{ ifta_filed: true }] };
      if (sql.includes("FROM accounting.journal_entries je")) return { rows: [{ count: 1 }] };
      if (sql.includes("accounting.month_close_checklist_ack")) {
        return { rows: [{ checklist_item: "ar_aging_review" }] };
      }
      return { rows: [] };
    });

    const status = await getMonthCloseStatus({
      userId: "11111111-1111-4111-8111-111111111111",
      operatingCompanyId: "22222222-2222-4222-8222-222222222222",
      period: "2026-05",
    });

    expect(status.ar_aging_review.overdue_count).toBe(3);
    expect(status.ar_aging_review.reviewed).toBe(true);
    expect(status.ar_aging_review.complete).toBe(true);
    expect(status.can_lock).toBe(true);
  });
});
