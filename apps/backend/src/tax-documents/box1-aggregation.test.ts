import { describe, expect, it } from "vitest";
import {
  aggregateBox1CompForTaxYear,
  loadTaxFormThreshold,
  BOX1_INCLUDED_LINE_TYPES,
  type Queryable,
} from "./box1-aggregation.service.js";

function mockClient(rows: { includedRows: Record<string, unknown>[]; chargebackRows: Record<string, unknown>[] }): Queryable {
  let call = 0;
  return {
    query: async <R extends Record<string, unknown>>(_sql: string, _values?: unknown[]) => {
      call += 1;
      // First query in aggregateBox1CompForTaxYear is the included-line-types sum, second is chargebacks.
      if (call === 1) return { rows: rows.includedRows as unknown as R[] };
      return { rows: rows.chargebackRows as unknown as R[] };
    },
  };
}

describe("BOX1_INCLUDED_LINE_TYPES", () => {
  it("includes exactly earnings/extra_pay/team_split_primary/team_split_secondary — never deduction or reimbursement", () => {
    expect([...BOX1_INCLUDED_LINE_TYPES].sort()).toEqual(
      ["earnings", "extra_pay", "team_split_primary", "team_split_secondary"].sort()
    );
    expect(BOX1_INCLUDED_LINE_TYPES).not.toContain("deduction");
    expect(BOX1_INCLUDED_LINE_TYPES).not.toContain("reimbursement");
  });
});

describe("aggregateBox1CompForTaxYear", () => {
  // SETL-TAX-YEAR-USES-CLEARED-DATE — a payment issued Dec 31 that happens to clear the bank Jan 2
  // must stay in the issue-year 1099 bucket. This function delegates the actual date filtering to
  // SQL, so the regression that matters is the QUERY TEXT itself: it must key on
  // payment_sent_at/paid_at (the two issue-date columns) and must NEVER reference
  // payment_cleared_at (the later, reconciliation-only date) anywhere in the year predicate.
  it("keys the tax-year predicate on payment_sent_at/paid_at, never payment_cleared_at", async () => {
    const seenSql: string[] = [];
    const client: Queryable = {
      query: async <R extends Record<string, unknown>>(sql: string) => {
        seenSql.push(sql);
        return { rows: [] as unknown as R[] };
      },
    };
    await aggregateBox1CompForTaxYear(client, "co-1", 2026);
    expect(seenSql.length).toBeGreaterThan(0);
    for (const sql of seenSql) {
      expect(sql).not.toMatch(/payment_cleared_at/);
      expect(sql).toMatch(/COALESCE\(\s*s\.payment_sent_at\s*,\s*s\.paid_at\s*\)/);
    }
  });

  it("sums earnings/extra_pay/team_split lines and nets same-year abandonment_chargeback, never net_pay", async () => {
    const client = mockClient({
      includedRows: [{ driver_id: "d1", total_cents: "500000", line_ids: ["l1", "l2"] }],
      chargebackRows: [{ driver_id: "d1", total_cents: "50000", line_ids: ["l3"] }],
    });
    const result = await aggregateBox1CompForTaxYear(client, "co-1", 2025);
    expect(result).toHaveLength(1);
    expect(result[0].driver_id).toBe("d1");
    // 500000 gross - 50000 same-year chargeback = 450000 cents box-1 comp.
    expect(result[0].box1_nonemployee_comp_cents).toBe(450000);
    expect(result[0].settlement_line_ids.sort()).toEqual(["l1", "l2", "l3"].sort());
  });

  it("never produces a negative Box-1 total even if chargeback exceeds gross", async () => {
    const client = mockClient({
      includedRows: [{ driver_id: "d1", total_cents: "10000", line_ids: ["l1"] }],
      chargebackRows: [{ driver_id: "d1", total_cents: "90000", line_ids: ["l2"] }],
    });
    const result = await aggregateBox1CompForTaxYear(client, "co-1", 2025);
    expect(result[0].box1_nonemployee_comp_cents).toBe(0);
  });

  it("returns an empty array when a driver has no included-type comp for the year", async () => {
    const client = mockClient({ includedRows: [], chargebackRows: [] });
    const result = await aggregateBox1CompForTaxYear(client, "co-1", 2025);
    expect(result).toEqual([]);
  });
});

describe("loadTaxFormThreshold", () => {
  it("returns the exact year-keyed threshold row, never a hardcoded literal", async () => {
    const client: Queryable = {
      query: async () => ({
        rows: [
          {
            reporting_threshold_cents: "200000",
            recipient_copy_due_date: "2027-01-31",
            irs_copy_due_date: "2027-01-31",
          },
        ],
      }),
    };
    const threshold = await loadTaxFormThreshold(client, 2026, "1099_nec");
    expect(threshold).toEqual({
      reporting_threshold_cents: 200000,
      recipient_copy_due_date: "2027-01-31",
      irs_copy_due_date: "2027-01-31",
    });
  });

  it("returns null when no threshold row exists for the year (never silently defaults)", async () => {
    const client: Queryable = { query: async () => ({ rows: [] }) };
    const threshold = await loadTaxFormThreshold(client, 1999, "1099_nec");
    expect(threshold).toBeNull();
  });
});
