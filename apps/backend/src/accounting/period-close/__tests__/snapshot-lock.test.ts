import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CashBasisSnapshotMissingError, resolveCashBasisRead } from "../../cash-basis/read-policy.service.js";
import { writePeriodCashBasisSnapshotAtClose } from "../../cash-basis/period-close-snapshot.service.js";

describe("period close cash snapshot lock policy", () => {
  it("close-time writer inserts cash snapshot payload", async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("FROM accounting.journal_entry_postings p") && sql.includes("je.entry_date BETWEEN")) {
          return {
            rows: [
              {
                account_id: "11111111-1111-4111-8111-111111111111",
                account_code: "4000",
                account_name: "Revenue",
                account_type: "Income",
                total_debits: 0,
                total_credits: 100_000,
              },
            ],
          };
        }
        if (sql.includes("a.account_type IN ('Asset', 'Liability', 'Equity')")) {
          return {
            rows: [
              {
                account_id: "22222222-2222-4222-8222-222222222222",
                account_code: "1000",
                account_name: "Cash",
                account_type: "Asset",
                total_debits: 100_000,
                total_credits: 0,
              },
              {
                account_id: "33333333-3333-4333-8333-333333333333",
                account_code: "3000",
                account_name: "Equity",
                account_type: "Equity",
                total_debits: 0,
                total_credits: 100_000,
              },
            ],
          };
        }
        if (sql.includes("a.account_type IN ('Income', 'OtherIncome', 'CostOfGoodsSold', 'Expense', 'OtherExpense')")) {
          return {
            rows: [{ account_type: "Income", total_debits: 0, total_credits: 100_000 }],
          };
        }
        if (sql.includes("INSERT INTO accounting.period_cash_basis_snapshot")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    await writePeriodCashBasisSnapshotAtClose(client, {
      operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      periodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      computedByUserUuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });

    expect(queries.some((sql) => sql.includes("INSERT INTO accounting.period_cash_basis_snapshot"))).toBe(true);
  });

  it("closed-period cash read returns snapshot and skips recompute", async () => {
    const computeLive = vi.fn(async () => ({ from: "live" }));
    const resolved = await resolveCashBasisRead({
      basis: "cash",
      closedPeriodId: "period-1",
      snapshotPayload: { reports: { balance_sheet: { from: "snapshot" } } },
      reportKey: "balance_sheet",
      computeLiveCash: computeLive,
    });
    expect(resolved.source).toBe("snapshot");
    expect(resolved.report).toEqual({ from: "snapshot" });
    expect(computeLive).not.toHaveBeenCalled();
  });

  it("closed-period accrual read stays live", async () => {
    const computeLive = vi.fn(async () => ({ from: "live-accrual" }));
    const resolved = await resolveCashBasisRead({
      basis: "accrual",
      closedPeriodId: "period-1",
      snapshotPayload: { reports: { balance_sheet: { from: "snapshot" } } },
      reportKey: "balance_sheet",
      computeLiveCash: computeLive,
    });
    expect(resolved.source).toBe("live");
    expect(resolved.report).toEqual({ from: "live-accrual" });
    expect(computeLive).toHaveBeenCalledOnce();
  });

  it("open-period cash read recomputes live", async () => {
    const computeLive = vi.fn(async () => ({ from: "live-open" }));
    const resolved = await resolveCashBasisRead({
      basis: "cash",
      closedPeriodId: null,
      snapshotPayload: null,
      reportKey: "trial_balance",
      computeLiveCash: computeLive,
    });
    expect(resolved.source).toBe("live");
    expect(resolved.report).toEqual({ from: "live-open" });
    expect(computeLive).toHaveBeenCalledOnce();
  });

  it("closed-period cash read with missing snapshot throws lock error", async () => {
    await expect(
      resolveCashBasisRead({
        basis: "cash",
        closedPeriodId: "period-1",
        snapshotPayload: { reports: {} },
        reportKey: "profit_loss",
        computeLiveCash: async () => ({ from: "live" }),
      }),
    ).rejects.toBeInstanceOf(CashBasisSnapshotMissingError);
  });

  it("migration defines trigger blocking UPDATE/DELETE post-close", () => {
    const migrationPath = path.join(process.cwd(), "db/migrations/0218_period_cash_basis_snapshot_lock_trigger.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON accounting\.period_cash_basis_snapshot/);
    expect(sql).toMatch(/IH35_CASH_BASIS_SNAPSHOT_LOCKED/);
    expect(sql).toMatch(/CREATE TRIGGER trg_period_cash_basis_snapshot_lock/);
  });
});
