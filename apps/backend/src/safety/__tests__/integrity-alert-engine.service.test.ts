import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateIntegrityRulesForTenant,
  INTEGRITY_ALERT_ENGINE_VERSION,
  listIntegrityAlertRules,
} from "../integrity-alert-engine.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

describe("integrity alert engine service (A23-12)", () => {
  const query = vi.fn();

  beforeEach(() => {
    query.mockReset();
  });

  it("exports engine version", () => {
    expect(INTEGRITY_ALERT_ENGINE_VERSION).toBe("a23-12-v2");
  });

  it("lists rules for tenant", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: "r1", rule_code: "fuel_anomaly", enabled: true }],
      rowCount: 1,
    });
    const rows = await listIntegrityAlertRules({ query }, COMPANY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rule_code).toBe("fuel_anomaly");
  });

  it("evaluates fuel anomaly rule and inserts event + alert", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-1",
            operating_company_id: COMPANY,
            rule_code: "fuel_anomaly",
            rule_name: "Fuel",
            source_view: "safety.v_fuel_mpg_anomalies",
            alert_category: "driver_mpg_anomaly",
            subject_type: "driver",
            threshold_config: { min_rows: 1 },
            severity: "warning",
            enabled: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ driver_id: "d1", fuel_expense_id: "f1", anomaly_type: "too_low", operating_company_id: COMPANY }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: "evt-1", integrity_alert_id: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "alert-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);
    expect(result.rules_scanned).toBe(1);
    expect(result.events_inserted).toBe(1);
    expect(result.alerts_inserted).toBe(1);
  });

  // ── Financial integrity probes ────────────────────────────────────────────

  // These four tests validate the acct_* inline-SQL probes (added by 202606080222).
  // They use source_view names that do NOT match the existing view-based dispatcher
  // branches so only the acct_* rule_code branches fire.

  it("acct_unbalanced_je: detects unbalanced JE via inline SQL and creates event + alert", async () => {
    const JE_ID = "aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa";
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-uje",
            operating_company_id: COMPANY,
            rule_code: "acct_unbalanced_je",
            rule_name: "Unbalanced JE",
            source_view: "accounting.v_unbalanced_jes_inline",
            alert_category: "acct_unbalanced_je",
            subject_type: "journal_entry",
            threshold_config: {},
            severity: "critical",
            enabled: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ journal_entry_id: JE_ID, entry_date: "2026-01-15", memo: "test", debit_cents: 5000, credit_cents: 4000 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "evt-uje", integrity_alert_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "alert-uje" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);
    expect(result.rules_scanned).toBe(1);
    expect(result.events_inserted).toBe(1);
    expect(result.alerts_inserted).toBe(1);
    const probeCall = query.mock.calls[1];
    expect(probeCall?.[0]).toContain("accounting.journal_entry_postings");
    expect(probeCall?.[0]).toContain("HAVING");
  });

  it("acct_orphan_bill: detects orphan bill via inline SQL and creates event + alert", async () => {
    const BILL_ID = "bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb";
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-ob",
            operating_company_id: COMPANY,
            rule_code: "acct_orphan_bill",
            rule_name: "Orphan bill",
            source_view: "accounting.v_orphan_bills_inline",
            alert_category: "acct_orphan_bill",
            subject_type: "bill",
            threshold_config: {},
            severity: "warning",
            enabled: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ bill_id: BILL_ID, bill_date: "2026-01-10", reason: "no_lines" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "evt-ob", integrity_alert_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "alert-ob" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);
    expect(result.events_inserted).toBe(1);
    expect(result.alerts_inserted).toBe(1);
    const probeCall = query.mock.calls[1];
    expect(probeCall?.[0]).toContain("accounting.bills");
    expect(probeCall?.[0]).toContain("revoked_at IS NULL");
  });

  it("acct_orphan_payment: detects unapplied payment via inline SQL and creates event + alert", async () => {
    const PMT_ID = "cccccccc-0000-4000-8000-cccccccccccc";
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-op",
            operating_company_id: COMPANY,
            rule_code: "acct_orphan_payment",
            rule_name: "Orphan payment",
            source_view: "accounting.v_orphan_payments_inline",
            alert_category: "acct_orphan_payment",
            subject_type: "payment",
            threshold_config: {},
            severity: "warning",
            enabled: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ payment_id: PMT_ID, payment_date: "2026-01-05", amount_cents: 100000, amount_unapplied_cents: 100000 }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "evt-op", integrity_alert_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "alert-op" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);
    expect(result.events_inserted).toBe(1);
    expect(result.alerts_inserted).toBe(1);
    const probeCall = query.mock.calls[1];
    expect(probeCall?.[0]).toContain("accounting.payments");
    expect(probeCall?.[0]).toContain("payment_applications");
  });

  it("acct_posting_closed_period: detects posting in closed period via inline SQL and creates event + alert", async () => {
    const POSTING_ID = "dddddddd-0000-4000-8000-dddddddddddd";
    const JE_ID2 = "eeeeeeee-0000-4000-8000-eeeeeeeeeeee";
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-pcp",
            operating_company_id: COMPANY,
            rule_code: "acct_posting_closed_period",
            rule_name: "Posting in closed period",
            source_view: "accounting.v_postings_closed_period_inline",
            alert_category: "acct_posting_closed_period",
            subject_type: "journal_entry",
            threshold_config: {},
            severity: "critical",
            enabled: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ posting_id: POSTING_ID, journal_entry_id: JE_ID2, entry_date: "2025-12-20", closed_through: "2025-12-31" }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ id: "evt-pcp", integrity_alert_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "alert-pcp" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);
    expect(result.events_inserted).toBe(1);
    expect(result.alerts_inserted).toBe(1);
    const probeCall = query.mock.calls[1];
    expect(probeCall?.[0]).toContain("closed_period_cutoff");
    expect(probeCall?.[0]).toContain("journal_entry_postings");
  });

  it.each([
    {
      rule_code: "unbalanced_je",
      source_view: "accounting.v_unbalanced_journal_entries",
      alert_category: "ledger_unbalanced_je",
      row: { journal_entry_id: "je-1", debit_cents: 100, credit_cents: 90, operating_company_id: COMPANY },
      expectedSubjectKey: "je:je-1",
    },
    {
      rule_code: "orphan_bill",
      source_view: "accounting.v_orphan_bills",
      alert_category: "ledger_orphan_bill",
      row: { bill_id: "b-1", display_id: "BILL-1", orphan_reason: "no_lines", operating_company_id: COMPANY },
      expectedSubjectKey: "bill:b-1",
    },
    {
      rule_code: "orphan_payment",
      source_view: "accounting.v_orphan_payments",
      alert_category: "ledger_orphan_payment",
      row: { payment_id: "p-1", display_id: "PMT-1", operating_company_id: COMPANY },
      expectedSubjectKey: "payment:p-1",
    },
    {
      rule_code: "posting_closed_period",
      source_view: "accounting.v_postings_in_closed_period",
      alert_category: "ledger_posting_closed_period",
      row: { posting_id: "post-1", entry_date: "2025-01-15", closed_through: "2025-01-31", operating_company_id: COMPANY },
      expectedSubjectKey: "posting:post-1",
    },
  ])(
    "evaluates financial probe $rule_code, scans its view, and emits a ledger alert",
    async ({ rule_code, source_view, alert_category, row, expectedSubjectKey }) => {
      const calls: { sql: string; values?: unknown[] }[] = [];
      query.mockImplementation(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes("FROM safety.integrity_alert_rules") && sql.includes("enabled = true")) {
          return {
            rows: [
              {
                id: "rule-fin",
                operating_company_id: COMPANY,
                rule_code,
                rule_name: rule_code,
                source_view,
                alert_category,
                subject_type: "ledger",
                threshold_config: { min_rows: 1 },
                severity: "critical",
                enabled: true,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes(source_view)) {
          return { rows: [row], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO safety.integrity_alert_events")) {
          return { rows: [{ id: "evt-fin", integrity_alert_id: null }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO safety.integrity_alerts")) {
          return { rows: [{ id: "alert-fin" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);

      expect(result.rules_scanned).toBe(1);
      expect(result.events_inserted).toBe(1);
      expect(result.alerts_inserted).toBe(1);

      const probeCall = calls.find((c) => c.sql.includes(source_view));
      expect(probeCall, `probe must scan ${source_view}`).toBeTruthy();
      expect(probeCall?.values).toEqual([COMPANY]);

      const eventInsert = calls.find((c) => c.sql.includes("INSERT INTO safety.integrity_alert_events"));
      expect(eventInsert?.values).toContain(expectedSubjectKey);

      const alertInsert = calls.find((c) => c.sql.includes("INSERT INTO safety.integrity_alerts"));
      expect(alertInsert?.values).toContain(alert_category);
      expect(alertInsert?.values).toContain("ledger");
    }
  );

  it("skips alert insert when event already linked", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "rule-2",
            operating_company_id: COMPANY,
            rule_code: "gps_spoof_pattern",
            rule_name: "GPS",
            source_view: "safety.v_driver_dwell_outliers",
            alert_category: "driver_incident_frequency",
            subject_type: "driver",
            threshold_config: { min_minutes_over_avg: 120 },
            severity: "critical",
            enabled: true,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ driver_id: "d2", minutes_over_avg: 200, operating_company_id: COMPANY }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ id: "evt-2", integrity_alert_id: "alert-existing" }],
        rowCount: 1,
      });

    const result = await evaluateIntegrityRulesForTenant({ query }, COMPANY);
    expect(result.events_inserted).toBe(1);
    expect(result.alerts_inserted).toBe(0);
  });
});
