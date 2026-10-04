#!/usr/bin/env node
/**
 * verify-ap-control-written-only-by-documents — ROUND 393.1, CC-1.
 *
 * A/P is a control account: credited by a bill, debited by a bill payment / vendor credit (or settlement deductions
 * applied to the driver's load bills); any other line may only REVERSE an original (odd depth along
 * reversal_of_line_id). Migration 202615380200 refuses everything else at write time. Measured 2026-10-04 (USMCA): 60
 * "DEFECT 3" re-reversals (source journal_entry, depth 2) carried $2,976.63 of A/P that no vendor is owed.
 *
 * STATIC:
 *   RULE 1 — 202615380200 defines the refusal with the allowed documents, the debit-only settlement application and the
 *            odd-depth reversal rule, resolving A/P through accounting.chart_of_accounts_roles (never a number).
 *   RULE 2 — no later migration drops trg_ap_control_written_only_by_documents or its function.
 * LIVE (direct, read-only), once 202615380200 is applied:
 *   RULE 3 — the trigger is installed, enabled, BEFORE INSERT on accounting.journal_entry_postings.
 *   RULE 4 — 0 A/P lines created after the rule was applied that are not a bill / bill_payment / vendor_credit /
 *            settlement-application debit and not a reversal (every such write must have been refused).
 *   Reported, not failed: the legacy journal_entry lines on A/P (the 60 — an owner decision, their documents are gone).
 * --selftest exercises every rule.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ap-control-written-only-by-documents";
const MIG = "202615380200";
export const REQUIRES_LIVE_DB = "A/P is live money — fails closed without a database";
const strip = (s) => s.replace(/--[^\n]*/g, "");

export function staticProblems(files, read) {
  const out = [];
  const mine = files.find((f) => f.startsWith(MIG));
  if (!mine) return [`RULE 1 migration ${MIG} is missing`];
  const s = strip(read(mine));
  if (!/chart_of_accounts_roles[\s\S]*role\s*=\s*'ap_control'/i.test(s)) out.push("RULE 1 the refusal does not resolve A/P through accounting.chart_of_accounts_roles");
  if (!/IN \('bill', 'bill_payment', 'vendor_credit'\)/.test(s)) out.push("RULE 1 the allowed document list (bill / bill_payment / vendor_credit) is gone");
  if (!/'driver_settlement' AND NEW\.debit_or_credit = 'debit'/.test(s)) out.push("RULE 1 the settlement application is no longer debit-only");
  if (!/v_depth % 2 = 1/.test(s)) out.push("RULE 1 the odd-depth (removes-an-amount) reversal rule is gone");
  if (!/BEFORE INSERT ON accounting\.journal_entry_postings/i.test(s)) out.push("RULE 1 the trigger is not BEFORE INSERT on journal_entry_postings");
  for (const f of files.filter((f) => f.slice(0, 12) > MIG)) {
    if (/DROP\s+(TRIGGER|FUNCTION)\s+(IF\s+EXISTS\s+)?(trg_ap_control_written_only_by_documents|accounting\.refuse_ap_control_write_without_document)/i.test(strip(read(f)))) out.push(`RULE 2 ${f} drops the A/P document refusal`);
  }
  return out;
}

export function liveProblems(m) {
  if (!m.applied) return [];
  const out = [];
  if (!m.trigger) out.push("RULE 3 trg_ap_control_written_only_by_documents is not installed");
  else if (m.trigger.enabled === "D") out.push("RULE 3 trg_ap_control_written_only_by_documents is DISABLED");
  if (m.undocumentedSince > 0) out.push(`RULE 4 ${m.undocumentedSince} A/P line(s) written since the rule without a document and not as a reversal`);
  return out;
}

export function run() {
  const dir = join(ROOT, "db/migrations");
  const files = readdirSync(dir).filter((f) => /^\d{12}_.*\.sql$/.test(f));
  return staticProblems(files, (f) => readFileSync(join(dir, f), "utf8"));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const good = "SELECT 1 FROM accounting.chart_of_accounts_roles r WHERE r.role = 'ap_control'; IF NEW.source_transaction_type IN ('bill', 'bill_payment', 'vendor_credit') THEN; IF NEW.source_transaction_type = 'driver_settlement' AND NEW.debit_or_credit = 'debit' THEN; IF v_depth % 2 = 1 THEN; CREATE TRIGGER t BEFORE INSERT ON accounting.journal_entry_postings";
    const files = [`${MIG}_ap.sql`];
    const cases = [
      ["the shipped shape passes", staticProblems(files, () => good).length === 0],
      ["resolving A/P by number fails", staticProblems(files, () => good.replace("chart_of_accounts_roles r WHERE r.role = 'ap_control'", "catalogs.accounts WHERE account_number = '2000'")).some((x) => x.startsWith("RULE 1"))],
      ["dropping the depth rule fails", staticProblems(files, () => good.replace("v_depth % 2 = 1", "true")).some((x) => x.includes("odd-depth"))],
      ["a later migration dropping the trigger fails", staticProblems([...files, "202699990000_x.sql"], (f) => (f.startsWith(MIG) ? good : "DROP TRIGGER IF EXISTS trg_ap_control_written_only_by_documents ON x;")).some((x) => x.startsWith("RULE 2"))],
      ["live clean passes", liveProblems({ applied: true, trigger: { enabled: "O" }, undocumentedSince: 0 }).length === 0],
      ["a missing trigger fails", liveProblems({ applied: true, trigger: null, undocumentedSince: 0 }).some((x) => x.startsWith("RULE 3"))],
      ["an undocumented A/P line after the rule fails", liveProblems({ applied: true, trigger: { enabled: "O" }, undocumentedSince: 1 }).some((x) => x.startsWith("RULE 4"))],
      ["before the migration there is nothing live to check", liveProblems({ applied: false }).length === 0],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const applied = (await client.query(`SELECT applied_at FROM _system._schema_migrations WHERE filename LIKE '${MIG}%'`)).rows[0]?.applied_at ?? null;
    const trigger = (await client.query(`SELECT tgenabled AS enabled FROM pg_trigger WHERE tgname = 'trg_ap_control_written_only_by_documents' AND tgrelid = 'accounting.journal_entry_postings'::regclass`)).rows[0] ?? null;
    const apLines = `FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id = p.account_id AND r.operating_company_id = p.operating_company_id AND r.role = 'ap_control' AND r.is_active`;
    const undocumentedSince = applied
      ? (await client.query(`SELECT count(*)::int n ${apLines} WHERE p.created_at >= $1 AND p.reversal_of_line_id IS NULL
            AND NOT (COALESCE(p.source_transaction_type, '') IN ('bill', 'bill_payment', 'vendor_credit') OR (p.source_transaction_type = 'driver_settlement' AND p.debit_or_credit = 'debit'))`, [applied])).rows[0].n
      : 0;
    const legacy = (await client.query(`SELECT count(*)::int n, COALESCE(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint net ${apLines} WHERE p.source_transaction_type = 'journal_entry'`)).rows[0];
    await client.query("ROLLBACK");
    problems.push(...liveProblems({ applied: Boolean(applied), trigger, undocumentedSince }));
    if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${applied ? "the A/P document refusal is armed; 0 undocumented A/P lines since it applied" : `${MIG} not applied on this database yet — static rules only`}. Legacy journal_entry lines on A/P (owner decision, ROUND 393.1 step 3): ${legacy.n} line(s), net credit ${legacy.net} cents.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
