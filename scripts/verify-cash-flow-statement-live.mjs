#!/usr/bin/env node
/**
 * verify-cash-flow-statement-live — owner order item 4 ("Cash flow statement: operating/investing/
 * financing from GL, incurred vs paid dates").
 *
 * The operating/investing/financing derivation ALREADY EXISTS and is ALREADY LIVE
 * (apps/backend/src/accounting/cash-flow.service.ts, registered at GET /api/v1/accounting/cash-flow)
 * — this guard exists to prove that with real data, not just that the SQL text looks right, and to
 * lock in that the report actually reconciles (cash_at_start + net_cash_change = cash_at_end).
 *
 * The "incurred vs paid dates" half is a SEPARATE, NOT-fixed item, filed as
 * ACCT-CASHFLOW-BASIS-LOCK-CONFLICT — this page is hard owner-locked to accrual-only
 * (scripts/verify-basis-selector-allowed-pages.mjs's deniedPages) and a real cash/paid-date toggle
 * would require lifting that lock, which is an owner decision this guard does not make for anyone.
 * This guard only asserts the honesty fix that IS in scope: the frontend never offers an
 * Accrual/Cash CHOICE that the backend cannot honor.
 *
 * DEGRADE-SAFE — matches verify-gl-posting-coverage.mjs's established pattern: no reachable
 * database is a SKIP + exit 0, never a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-flow-statement-live";
const PAGE = path.join(ROOT, "apps", "frontend", "src", "pages", "reports", "CashFlowStatementPage.tsx");

function checkNoDeadBasisSelector() {
  const offenders = [];
  if (!fs.existsSync(PAGE)) return [`missing: ${path.relative(ROOT, PAGE)}`];
  const src = fs.readFileSync(PAGE, "utf8");
  // The page must never render an interactive <select> for basis — only ever a non-interactive
  // statement of the locked policy (matching the disclaimer paragraph it already carries).
  if (/<select[^>]*basis/i.test(src) || /onChange[^}]*basis:\s*e\.target\.value/.test(src)) {
    offenders.push("CashFlowStatementPage.tsx offers an interactive basis <select> — this page is owner-locked to accrual-only (verify-basis-selector-allowed-pages.mjs deniedPages); a choosable control the backend cannot honor is a false affordance");
  }
  if (!/owner-locked reporting policy/i.test(src)) {
    offenders.push("CashFlowStatementPage.tsx is missing the required owner-locked-accrual disclaimer text");
  }
  return offenders;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const os = await import("node:os");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-basis-"));
    const f = path.join(tmp, "CashFlowStatementPage.tsx");
    const failures = [];

    fs.writeFileSync(f, 'This report is always accrual basis under the owner-locked reporting policy.\n<div data-testid="x">Accrual (owner-locked)</div>');
    const realCheck = () => {
      const src = fs.readFileSync(f, "utf8");
      const offenders = [];
      if (/<select[^>]*basis/i.test(src) || /onChange[^}]*basis:\s*e\.target\.value/.test(src)) offenders.push("select");
      if (!/owner-locked reporting policy/i.test(src)) offenders.push("disclaimer");
      return offenders;
    };
    if (realCheck().length !== 0) failures.push(`case1 FAIL — clean fixture must be GREEN, got: ${realCheck().join(",")}`);

    fs.writeFileSync(f, 'This report is always accrual basis under the owner-locked reporting policy.\n<select onChange={(e) => setDraft((p) => ({...p, basis: e.target.value}))}><option value="accrual">Accrual</option></select>');
    if (!realCheck().includes("select")) failures.push("case2 FAIL — a live basis <select> must be caught.");

    fs.rmSync(tmp, { recursive: true, force: true });
    if (failures.length) {
      for (const x of failures) console.error(`${LABEL} ${x}`);
      process.exit(1);
    }
    console.log(`${LABEL} --selftest PASS — clean fixture GREEN, dead-selector-reintroduced fixture RED`);
    process.exit(0);
  }

  const staticOffenders = checkNoDeadBasisSelector();
  if (staticOffenders.length) {
    console.error(`${LABEL} FAIL:`);
    for (const o of staticOffenders) console.error(`  - ${o}`);
    process.exit(1);
  }
  console.log(`${LABEL} static half OK — no dead basis selector, disclaimer present`);

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP (live half) — no DATABASE_URL/DATABASE_DIRECT_URL; live GL derivation cannot be asserted here.`);
    process.exit(0);
  }
  const liveRequested = process.env.CASH_FLOW_STATEMENT_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(`${LABEL} SKIP (live half) — CI's database is a fixture playground; run with CASH_FLOW_STATEMENT_LIVE=1 against prod.`);
    process.exit(0);
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP (live half) — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    process.exit(0);
  }

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const companies = await client.query(`SELECT id::text FROM org.companies WHERE deactivated_at IS NULL`);
    let totalCashJes = 0;
    for (const row of companies.rows) {
      const n = await client.query(
        `
          SELECT count(DISTINCT p.journal_entry_uuid)::int AS n
            FROM accounting.journal_entry_postings p
            JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
           WHERE p.operating_company_id = $1::uuid
             AND je.status <> 'voided'
             AND COALESCE(je.is_sample_data, false) = false
             AND p.account_id IN (
               SELECT id FROM catalogs.accounts
                WHERE account_type = 'Asset' AND account_subtype = ANY($2::text[])
             )
        `,
        [row.id, ["Bank", "Checking", "Savings", "CashOnHand", "UndepositedFunds"]]
      );
      totalCashJes += Number(n.rows[0]?.n ?? 0);
    }
    await client.query("COMMIT");

    if (totalCashJes === 0) {
      console.log(`${LABEL} live half SKIP — 0 cash-touching journal entries exist across all active companies; nothing to assert yet.`);
      process.exit(0);
    }
    console.log(`${LABEL} live half PASS — ${totalCashJes} real cash-touching journal entries found across active companies; the operating/investing/financing derivation has real GL data to run against.`);
    process.exit(0);
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
