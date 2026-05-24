import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  const query = vi.fn();
  return {
    query,
    withCurrentUser: vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    appendCrudAudit: vi.fn(async () => undefined),
    insertRetainedEarningsClosingJournalIfNeeded: vi.fn(async () => "je-retained-1"),
    writePeriodCashBasisSnapshotAtClose: vi.fn(async () => undefined),
  };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mocked.withCurrentUser,
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

import { getMonthCloseStatus, lockMonthClose } from "../month-close.service.js";

describe("month close service", () => {
  beforeEach(() => {
    mocked.query.mockReset();
    mocked.appendCrudAudit.mockClear();
    mocked.insertRetainedEarningsClosingJournalIfNeeded.mockClear();
    mocked.writePeriodCashBasisSnapshotAtClose.mockClear();
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
      if (sql.includes("FROM accounting.sales_tax_returns")) return { rows: [{ ifta_filed: false }] };
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
    expect(status.fuel_tax.ifta_filed).toBe(false);
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
      if (sql.includes("FROM accounting.sales_tax_returns")) return { rows: [{ ifta_filed: true }] };
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
});
