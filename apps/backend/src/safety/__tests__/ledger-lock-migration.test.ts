import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../..");
const migrationPath = path.join(
  repoRoot,
  "db/migrations/202606080222_ledger_closed_period_lock_and_financial_probes.sql"
);

describe("ledger closed-period lock + financial probes migration (202606080222)", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("installs the closed-period guard on journal_entry_postings only", () => {
    expect(sql).toMatch(
      /DROP TRIGGER IF EXISTS trg_block_closed_period_je_postings ON accounting\.journal_entry_postings/
    );
    expect(sql).toMatch(/CREATE TRIGGER trg_block_closed_period_je_postings/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON accounting\.journal_entry_postings/);
  });

  it("resolves the period date through the parent journal entry", () => {
    expect(sql).toMatch(/FROM accounting\.journal_entries je/);
    expect(sql).toMatch(/je\.id = (NEW|OLD)\.journal_entry_uuid/);
  });

  it("mirrors the 0183 closed-period raise helper / ERRCODE (no duplicated cutoff logic)", () => {
    expect(sql).toMatch(/PERFORM accounting\.raise_if_txn_in_closed_period/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION accounting\.trg_block_closed_period_je_postings/);
  });

  it("does not re-add guards already installed by 0183 on the parent tables", () => {
    expect(sql).not.toMatch(/CREATE TRIGGER trg_block_closed_period_journal_entries\b/);
    expect(sql).not.toMatch(/CREATE TRIGGER trg_block_closed_period_bills\b/);
    expect(sql).not.toMatch(/CREATE TRIGGER trg_block_closed_period_payments\b/);
  });

  it("widens the alert sink CHECK enums to admit the four acct_ categories", () => {
    expect(sql).toMatch(/integrity_alerts_alert_category_check/);
    expect(sql).toMatch(/'acct_unbalanced_je'/);
    expect(sql).toMatch(/'acct_orphan_bill'/);
    expect(sql).toMatch(/'acct_orphan_payment'/);
    expect(sql).toMatch(/'acct_posting_closed_period'/);
  });

  it("widens subject_type on both the alerts and rules tables", () => {
    expect(sql).toMatch(/integrity_alerts_subject_type_check/);
    expect(sql).toMatch(/integrity_alert_rules_subject_type_check/);
    expect(sql).toMatch(/'journal_entry', 'bill', 'payment'/);
  });

  it("seeds the four financial probe rules idempotently per company", () => {
    expect(sql).toMatch(/INSERT INTO safety\.integrity_alert_rules/);
    expect(sql).toMatch(/FROM org\.companies c/);
    expect(sql).toMatch(/ON CONFLICT \(operating_company_id, rule_code\) DO NOTHING/);
  });

  it("wraps the migration in a single transaction", () => {
    expect(sql.trimStart()).toMatch(/^(--[^\n]*\n)*\s*BEGIN;/);
    expect(sql).toMatch(/COMMIT;/);
  });
});
