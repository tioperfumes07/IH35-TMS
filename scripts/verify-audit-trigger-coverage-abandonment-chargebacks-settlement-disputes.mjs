#!/usr/bin/env node
/**
 * ACCT-F5759 — LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER re-verification found the board's own
 * "100% money-lane audit coverage" claim (PR #13276/ACCT-F5677) undercounted using an overly narrow
 * trigger-name pattern that missed the `trg_audit_<table>` naming convention most tables use.
 * driver_finance.abandonment_chargebacks and driver_finance.settlement_disputes — both real money
 * tables — genuinely had no audit trigger of any name. This migration attaches the reused
 * audit.tg_audit_row() function to both.
 *
 * INVARIANT (static — no database): the migration file must exist and attach
 * trg_audit_abandonment_chargebacks / trg_audit_settlement_disputes via audit.tg_audit_row(),
 * idempotently (guarded by a pg_trigger existence check).
 *
 * Self-test: node scripts/verify-audit-trigger-coverage-abandonment-chargebacks-settlement-disputes.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "db/migrations/202613000000_acct_f5759_audit_trigger_abandonment_chargebacks_settlement_disputes.sql";
const LABEL = "verify-audit-trigger-coverage-abandonment-chargebacks-settlement-disputes";

export function checkMigration(src) {
  const problems = [];
  if (!/CREATE TRIGGER trg_audit_abandonment_chargebacks\s*\n\s*AFTER INSERT OR UPDATE OR DELETE ON driver_finance\.abandonment_chargebacks\s*\n\s*FOR EACH ROW EXECUTE FUNCTION audit\.tg_audit_row\(\)/.test(src)) {
    problems.push(`${MIGRATION}: missing (or malformed) trg_audit_abandonment_chargebacks trigger attach`);
  }
  if (!/CREATE TRIGGER trg_audit_settlement_disputes\s*\n\s*AFTER INSERT OR UPDATE OR DELETE ON driver_finance\.settlement_disputes\s*\n\s*FOR EACH ROW EXECUTE FUNCTION audit\.tg_audit_row\(\)/.test(src)) {
    problems.push(`${MIGRATION}: missing (or malformed) trg_audit_settlement_disputes trigger attach`);
  }
  if (!/NOT EXISTS\s*\(\s*SELECT 1 FROM pg_trigger/.test(src)) {
    problems.push(`${MIGRATION}: no idempotency guard (pg_trigger existence check) found`);
  }
  return problems;
}

function selftest() {
  const good = `
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_audit_abandonment_chargebacks'
    ) THEN
      CREATE TRIGGER trg_audit_abandonment_chargebacks
        AFTER INSERT OR UPDATE OR DELETE ON driver_finance.abandonment_chargebacks
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_audit_settlement_disputes'
    ) THEN
      CREATE TRIGGER trg_audit_settlement_disputes
        AFTER INSERT OR UPDATE OR DELETE ON driver_finance.settlement_disputes
        FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
    END IF;
  `;
  const goodProblems = checkMigration(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    good.replace(/CREATE TRIGGER trg_audit_abandonment_chargebacks[\s\S]*?audit\.tg_audit_row\(\);/, ""),
    good.replace(/CREATE TRIGGER trg_audit_settlement_disputes[\s\S]*?audit\.tg_audit_row\(\);/, ""),
    good.replace(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_trigger/g, "IF true OR ("),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkMigration(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const migrationPath = path.join(ROOT, MIGRATION);
if (!fs.existsSync(migrationPath)) {
  console.error(`[${LABEL}] FAILED — ${MIGRATION} not found`);
  process.exit(1);
}
const src = fs.readFileSync(migrationPath, "utf8");
const failures = checkMigration(src);
if (failures.length) {
  console.error(`[${LABEL}] FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — abandonment_chargebacks and settlement_disputes both attach audit.tg_audit_row() idempotently`);
