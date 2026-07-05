/**
 * MOR (UST Form 425C) court cash lines — deterministic proofs for the phantom-column repair.
 *
 * These run everywhere (no DB). They prove, at the summary-mapping boundary:
 *   (1) receipts/disbursements are NOT SWAPPED — the is_credit grouping maps to line 20 (receipts)
 *       and line 21 (disbursements) in the correct direction, and opening cash carries forward.
 *   (2) FAIL-LOUD — a thrown banking query rejects instead of returning $0 (the old zero-swallow).
 *   (3) a genuinely dormant month (0 in-scope rows) is allowed to be $0, but a $0 computed from a
 *       period that HAS activity throws mor_cash_zero_with_activity.
 * The SQL-level is_credit grouping + own-transfer exclusion against real Postgres is proven in
 * form-425c-cash-lines.db.test.ts (CI only).
 */
import { describe, expect, it } from "vitest";
import { computeBankingSummary } from "../form-425c.routes.js";

type QueryFn = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

function client(fn: QueryFn) {
  return { query: fn as <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };
}

const COMPANY = "44444444-4444-4444-8444-444444444444";

describe("computeBankingSummary — court cash lines 19–23", () => {
  it("maps receipts→line20 and disbursements→line21 (NOT swapped) and carries opening forward", async () => {
    // Prior month filed ending cash = $10,000.00 → this month's opening (line 19).
    // This month: receipts $1,500.25 (is_credit=true legs) + disbursements $420.50 (is_credit=false legs).
    const summary = await computeBankingSummary(
      client(async (sql) => {
        if (sql.includes("line_23_ending_cash")) return { rows: [{ line_23_ending_cash: "10000.00" }] };
        if (sql.includes("receipts_cents")) {
          return { rows: [{ receipts_cents: "150025", disbursements_cents: "42050", in_scope_txn_count: "2" }] };
        }
        return { rows: [] };
      }),
      COMPANY,
      "2026-05"
    );
    expect(summary.line_19_opening_cash).toBe(10000);
    expect(summary.line_20_receipts).toBe(1500.25); // money IN — NOT the disbursement
    expect(summary.line_21_disbursements).toBe(420.5); // money OUT — NOT the receipt
    expect(summary.line_22_net_cash_flow).toBeCloseTo(1079.75, 2);
    expect(summary.line_23_ending_cash).toBeCloseTo(11079.75, 2);
  });

  it("FAILS LOUD (rejects) when the banking query throws — never returns $0", async () => {
    await expect(
      computeBankingSummary(
        client(async (sql) => {
          if (sql.includes("line_23_ending_cash")) return { rows: [] };
          if (sql.includes("receipts_cents")) throw Object.assign(new Error('column "amount" does not exist'), { code: "42703" });
          return { rows: [] };
        }),
        COMPANY,
        "2026-05"
      )
    ).rejects.toThrow(/does not exist/);
  });

  it("allows a genuinely dormant month ($0 with zero in-scope rows)", async () => {
    const summary = await computeBankingSummary(
      client(async (sql) => {
        if (sql.includes("line_23_ending_cash")) return { rows: [{ line_23_ending_cash: "500.00" }] };
        if (sql.includes("receipts_cents")) {
          return { rows: [{ receipts_cents: "0", disbursements_cents: "0", in_scope_txn_count: "0" }] };
        }
        return { rows: [] };
      }),
      COMPANY,
      "2026-05"
    );
    expect(summary.line_20_receipts).toBe(0);
    expect(summary.line_21_disbursements).toBe(0);
    expect(summary.line_23_ending_cash).toBe(500);
  });

  it("throws mor_cash_zero_with_activity when a period with activity computes $0", async () => {
    await expect(
      computeBankingSummary(
        client(async (sql) => {
          if (sql.includes("line_23_ending_cash")) return { rows: [] };
          if (sql.includes("receipts_cents")) {
            return { rows: [{ receipts_cents: "0", disbursements_cents: "0", in_scope_txn_count: "7" }] };
          }
          return { rows: [] };
        }),
        COMPANY,
        "2026-05"
      )
    ).rejects.toThrow("mor_cash_zero_with_activity");
  });
});
