#!/usr/bin/env node
/**
 * GUARD — LEAD 443.51 (CC-3): healthz ledger.ap_tieout compares GL ap_control (2000) with the open bill subledger.
 *   RULE 1 (static) — assertApTieout excludes a driver-settlement bill (driver_settlement_gl_bills) ONLY when its own bill
 *          posting does NOT credit ap_control (ROUND 148 adopted bills → 2170). Settlement A/P-chain bills credit 2000 with
 *          the net left open (R12) and must be counted — excluding them all showed a 103,919.26 false variance (146 bills).
 *   RULE 2 (live) — the same comparison on USMCA ties to the cent.
 * Run: node scripts/verify-settlement-creator-ap-tieout-counts-chain-bills.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "A/P control vs its subledger is live money — fails closed without a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-ap-tieout-counts-chain-bills";
const SRC = "apps/backend/src/health/ledger-financial-health.checks.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function staticProblems(src) {
  const a = src.indexOf("export async function assertApTieout(");
  const body = a < 0 ? "" : src.slice(a, src.indexOf("\n}\n", a));
  const p = [];
  if (!body) return ["assertApTieout not found"];
  if (!/AND NOT \(\s*EXISTS \(\s*SELECT 1 FROM driver_finance\.driver_settlement_gl_bills g/.test(body)) p.push("RULE 1 the settlement-bill exclusion is no longer conditional (it drops every driver_settlement_gl_bills bill)");
  if (!/AND NOT EXISTS \([\s\S]*?bp\.source_transaction_type = 'bill' AND bp\.source_transaction_id = b\.id::text[\s\S]*?bp\.account_id = \$2::uuid AND bp\.debit_or_credit = 'credit'/.test(body)) p.push("RULE 1 a settlement bill whose own posting credits ap_control is not kept in the subledger");
  if (!/\[HEALTH_LEDGER_OPCO, apAccountId\]\s*\);\s*const glCents/.test(body)) p.push("RULE 1 the subledger query does not bind ap_control");
  return p;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, SRC), "utf8");
  const bad = [];
  if (staticProblems(good).length) bad.push(`real tree flagged: ${staticProblems(good).join("; ")}`);
  const plants = [
    (s) => s.replace(/AND NOT \(\s*EXISTS \(\s*SELECT 1 FROM driver_finance\.driver_settlement_gl_bills g/, "AND NOT EXISTS (\n               SELECT 1 FROM driver_finance.driver_settlement_gl_bills g"),
    (s) => s.replace("bp.account_id = $2::uuid AND bp.debit_or_credit = 'credit'", "bp.debit_or_credit = 'credit'"),
    (s) => s.replace("[HEALTH_LEDGER_OPCO, apAccountId]\n    );\n    const glCents", "[HEALTH_LEDGER_OPCO]\n    );\n    const glCents"),
  ];
  for (const f of plants) {
    const pl = f(good);
    if (pl === good) bad.push(`plant did not apply: ${f.toString().slice(0, 70)}`);
    else if (!staticProblems(pl).length) bad.push(`plant passed: ${f.toString().slice(0, 70)}`);
  }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = staticProblems(fs.readFileSync(path.join(ROOT, SRC), "utf8"));
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let gl = 0, sub = 0;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const ap = (await client.query(`SELECT account_id FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ap_control'`, [USMCA])).rows[0]?.account_id;
    if (!ap) p.push("RULE 2 ap_control unbound");
    else {
      gl = Number((await client.query(
        `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS c
           FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
          WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid AND je.status <> 'voided' AND COALESCE(je.is_sample_data, false) = false`,
        [USMCA, ap])).rows[0].c);
      sub = Number((await client.query(
        `SELECT COALESCE(SUM(ROUND((b.total_amount - COALESCE(b.paid_amount, 0)) * 100)), 0)::bigint AS c
           FROM accounting.bills b
          WHERE b.operating_company_id = $1::uuid AND b.revoked_at IS NULL AND b.status <> 'draft' AND COALESCE(b.is_sample_data, false) = false
            AND NOT (EXISTS (SELECT 1 FROM driver_finance.driver_settlement_gl_bills g WHERE g.operating_company_id = b.operating_company_id AND g.accounting_bill_id = b.id)
                     AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings bp JOIN accounting.journal_entries bje ON bje.id = bp.journal_entry_uuid
                                      WHERE bp.operating_company_id = b.operating_company_id AND bp.source_transaction_type = 'bill' AND bp.source_transaction_id = b.id::text
                                        AND bp.account_id = $2::uuid AND bp.debit_or_credit = 'credit' AND bje.status <> 'voided'))`,
        [USMCA, ap])).rows[0].c);
      if (gl !== sub) p.push(`RULE 2 A/P control ${gl}c vs open subledger ${sub}c — variance ${gl - sub}c`);
    }
    await client.query("ROLLBACK");
  } finally {
    client.release?.(); await pool?.end?.();
  }
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS — A/P control ${(gl / 100).toFixed(2)} = open subledger ${(sub / 100).toFixed(2)}`);
}
