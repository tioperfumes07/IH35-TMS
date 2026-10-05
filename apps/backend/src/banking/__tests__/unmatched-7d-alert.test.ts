import { describe, expect, it, vi } from "vitest";
import {
  AGED_UNMATCHED_BANK_LINE_SQL,
  BANK_UNMATCHED_7D_RULE_CODE,
  BANK_UNMATCHED_7D_SUBJECT_KEY,
  UNMATCHED_7D_THRESHOLD_DAYS,
  detectionSummaryForDigest,
  ensureBankUnmatched7dRule,
} from "../unmatched-7d-alert.js";

describe("ENG-7D unmatched 7-day alert predicate", () => {
  it("uses a single 7-day age threshold, not 30/90", () => {
    expect(UNMATCHED_7D_THRESHOLD_DAYS).toBe(7);
    expect(BANK_UNMATCHED_7D_RULE_CODE).toBe("bank_unmatched_7d");
    expect(BANK_UNMATCHED_7D_SUBJECT_KEY).toBe("bank_unmatched_7d:company");
  });

  it("matches on aged transaction_date and document pointers, not recent created_at or coa_account_id", () => {
    expect(AGED_UNMATCHED_BANK_LINE_SQL).toContain("transaction_date");
    expect(AGED_UNMATCHED_BANK_LINE_SQL).toContain("matched_bill_id");
    expect(AGED_UNMATCHED_BANK_LINE_SQL).toContain("matched_expense_id");
    expect(AGED_UNMATCHED_BANK_LINE_SQL).toContain("matched_invoice_id");
    expect(AGED_UNMATCHED_BANK_LINE_SQL).toContain("matched_settlement_id");
    expect(AGED_UNMATCHED_BANK_LINE_SQL).toContain("matched_deposit_id");
    expect(AGED_UNMATCHED_BANK_LINE_SQL).not.toContain("coa_account_id");
    expect(AGED_UNMATCHED_BANK_LINE_SQL).not.toContain("created_at");
    expect(AGED_UNMATCHED_BANK_LINE_SQL).not.toMatch(/30|90/);
  });

  it("names the digest count in the detection summary", () => {
    expect(
      detectionSummaryForDigest(
        {
          unmatched_count: 831,
          oldest_transaction_date: "2026-08-01",
          newest_transaction_date: "2026-09-26",
          sample_bank_transaction_ids: [],
        },
        7
      )
    ).toBe("831 bank lines unmatched for 7+ days oldest 2026-08-01");
    expect(
      detectionSummaryForDigest(
        {
          unmatched_count: 0,
          oldest_transaction_date: null,
          newest_transaction_date: null,
          sample_bank_transaction_ids: [],
        },
        7
      )
    ).toBe("No bank lines unmatched for 7+ days");
  });

  it("ensures the catalog rule at the engine door — CREATE-only, posts nothing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await ensureBankUnmatched7dRule({ query }, "11111111-1111-4111-8111-111111111111");
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("INSERT INTO safety.integrity_alert_rules");
    expect(sql).toContain("ON CONFLICT (operating_company_id, rule_code) DO NOTHING");
    expect(sql).toContain("accounting_integrity");
    expect(sql).toContain('"stale_days": 7');
    expect(sql).not.toContain("journal_entry");
  });
});
