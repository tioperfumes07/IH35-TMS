#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "db/migrations/202614060000_historical_settlement_attributions.sql";

const REQUIRED = [
  ["both CREATE-only tables", /CREATE TABLE IF NOT EXISTS driver_finance\.historical_settlement_attributions[\s\S]*CREATE TABLE IF NOT EXISTS driver_finance\.historical_settlement_attribution_items/i],
  ["source settlement/payrun/JE and target settlement edges", /source_settlement_id uuid NOT NULL REFERENCES driver_finance\.driver_settlements\(id\)[\s\S]*source_payrun_id uuid NOT NULL REFERENCES driver_finance\.payrun_gl_runs\(id\)[\s\S]*source_journal_entry_id uuid NOT NULL REFERENCES accounting\.journal_entries\(id\)[\s\S]*target_settlement_id uuid NOT NULL REFERENCES driver_finance\.driver_settlements\(id\)/i],
  ["identity-only allocations stay NULL", /CHECK \(allocation_basis <> 'identity_only' OR allocated_net_cents IS NULL\)/i],
  ["company idempotency", /UNIQUE \(operating_company_id, idempotency_key\)/i],
  ["successor correction edge", /supersedes_id uuid UNIQUE REFERENCES driver_finance\.historical_settlement_attributions\(id\) ON DELETE RESTRICT/i],
  ["item source edges", /attribution_id uuid NOT NULL REFERENCES driver_finance\.historical_settlement_attributions\(id\)[\s\S]*load_id uuid NOT NULL REFERENCES mdata\.loads\(id\)[\s\S]*source_settlement_line_id uuid REFERENCES driver_finance\.settlement_lines\(id\)/i],
  ["membership uniqueness", /CREATE UNIQUE INDEX IF NOT EXISTS uq_historical_settlement_attribution_items_membership[\s\S]*WHERE source_settlement_line_id IS NULL/i],
  ["source payrun matches company, settlement, JE, and posted state", /r\.operating_company_id = NEW\.operating_company_id[\s\S]*r\.settlement_id = NEW\.source_settlement_id[\s\S]*r\.journal_entry_id = NEW\.source_journal_entry_id[\s\S]*r\.status = 'posted'/i],
  ["source journal is same-company and posted", /je\.operating_company_id = NEW\.operating_company_id[\s\S]*je\.status = 'posted'/i],
  ["successors preserve original source lineage", /prior\.source_settlement_id = NEW\.source_settlement_id[\s\S]*prior\.source_payrun_id = NEW\.source_payrun_id[\s\S]*prior\.source_journal_entry_id = NEW\.source_journal_entry_id/i],
  ["source line resolves to parent settlement and load", /sl\.settlement_id = source_settlement[\s\S]*COALESCE\(b\.load_id, sl\.load_id\) = NEW\.load_id/i],
  ["membership load belongs to original settlement or predecessor evidence", /l\.presettlement_link_id = source_settlement OR s\.first_load_id = NEW\.load_id[\s\S]*prior_item\.attribution_id = superseded_attribution[\s\S]*prior_item\.load_id = NEW\.load_id/i],
  ["both tables FORCE RLS", /ALTER TABLE driver_finance\.historical_settlement_attributions FORCE ROW LEVEL SECURITY[\s\S]*ALTER TABLE driver_finance\.historical_settlement_attribution_items FORCE ROW LEVEL SECURITY/i],
  ["Owner/Admin insert restriction", /identity\.current_user_role\(\) IN \('Owner', 'Administrator'\)/i],
  ["append-only runtime grants", /GRANT SELECT, INSERT ON driver_finance\.historical_settlement_attributions TO ih35_app[\s\S]*GRANT SELECT, INSERT ON driver_finance\.historical_settlement_attribution_items TO ih35_app[\s\S]*REVOKE UPDATE, DELETE, TRUNCATE/i],
  ["table-owner mutation blocker on both tables", /BEFORE UPDATE OR DELETE OR TRUNCATE ON driver_finance\.historical_settlement_attributions[\s\S]*BEFORE UPDATE OR DELETE OR TRUNCATE ON driver_finance\.historical_settlement_attribution_items/i],
];

export function analyze(sql) {
  const problems = REQUIRED.filter(([, pattern]) => !pattern.test(sql)).map(([name]) => `missing ${name}`);
  if (/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?driver_finance\.(?:driver_settlements|settlement_lines|payrun_gl_runs)\b/i.test(sql)) {
    problems.push("migration mutates existing settlement/payrun/line money records");
  }
  if (/\bINSERT\s+INTO\s+driver_finance\.historical_settlement_attribution/i.test(sql)) {
    problems.push("migration seeds historical attribution rows");
  }
  return problems;
}

const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
if (process.argv.includes("--selftest")) {
  const baseline = analyze(sql);
  if (baseline.length) {
    console.error(`verify-historical-settlement-attribution-schema SELFTEST FAIL — real migration invalid: ${baseline.join("; ")}`);
    process.exit(1);
  }
  const plants = [
    sql.replace("FORCE ROW LEVEL SECURITY;", "ENABLE ROW LEVEL SECURITY;"),
    sql.replace("AND r.status = 'posted'", ""),
    sql.replace("AND prior.source_journal_entry_id = NEW.source_journal_entry_id", ""),
    sql.replace("l.presettlement_link_id = source_settlement OR s.first_load_id = NEW.load_id", "TRUE"),
    sql.replace("BEFORE UPDATE OR DELETE OR TRUNCATE ON driver_finance.historical_settlement_attribution_items", "BEFORE DELETE ON driver_finance.historical_settlement_attribution_items"),
    `${sql}\nINSERT INTO driver_finance.historical_settlement_attributions DEFAULT VALUES;`,
  ];
  const caught = plants.filter((plant) => analyze(plant).length > 0).length;
  if (caught !== plants.length) {
    console.error(`verify-historical-settlement-attribution-schema SELFTEST FAIL — caught ${caught}/${plants.length} planted regressions`);
    process.exit(1);
  }
  console.log(`verify-historical-settlement-attribution-schema SELFTEST PASS — ${caught}/${plants.length} planted regressions rejected`);
  process.exit(0);
}

const problems = analyze(sql);
if (problems.length) {
  console.error("verify-historical-settlement-attribution-schema FAILED");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log("verify-historical-settlement-attribution-schema PASS — CREATE-only, company-scoped, append-only attribution contract locked");
