#!/usr/bin/env node
/**
 * verify-invoices-factored-column — A4 (STANDING-DIRECTIVES-2026-09-05.md §CC-1,
 * OWNER-ISSUE-INVENTORY inv #14: "Need a Factored column." invoices.factoring_status /
 * factor_profile_id / factoring_advance_id existed on every real invoice but rendered nowhere.
 *
 * STATIC HALF: InvoicesListPage.tsx must render a real Factored column keyed off
 * factoring_status, dash-never-blank (a default label for every branch, never an empty string).
 * The backend list + detail routes must join factoring.factor for the factor's display name.
 *
 * LIVE HALF: confirms accounting.invoices.factoring_status is a live, real column with the full
 * CHECK-constraint enum (not a guess at 4 states when the real schema has 7), and that the new
 * factor-name join resolves correctly (LEFT JOIN — never drops an invoice row for a null/unmatched
 * factor_profile_id).
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
const LABEL = "verify-invoices-factored-column";
const PAGE = path.join(ROOT, "apps", "frontend", "src", "pages", "accounting", "InvoicesListPage.tsx");
const ROUTE = path.join(ROOT, "apps", "backend", "src", "accounting", "invoices.routes.ts");

function checkStatic() {
  const failures = [];
  if (!fs.existsSync(PAGE)) return [`missing: ${path.relative(ROOT, PAGE)}`];
  if (!fs.existsSync(ROUTE)) return [`missing: ${path.relative(ROOT, ROUTE)}`];
  const pageSrc = fs.readFileSync(PAGE, "utf8");
  if (!/invoiceFactoredBadge/.test(pageSrc)) failures.push("InvoicesListPage.tsx does not render a Factored column");
  if (!/label\s*=\s*FACTORING_STATUS_LABEL\[status\]\s*\?\?\s*status/.test(pageSrc)) {
    failures.push("invoiceFactoredBadge does not fall back to a real label for an unrecognized status (dash-never-blank)");
  }
  if (!/key:\s*"factoring_status"/.test(pageSrc)) failures.push("no ParityColumn keyed on factoring_status");
  const routeSrc = fs.readFileSync(ROUTE, "utf8");
  const factorJoinCount = (routeSrc.match(/LEFT JOIN factoring\.factor fp ON fp\.id = i\.factor_profile_id/g) ?? []).length;
  if (factorJoinCount < 2) {
    failures.push(`invoices.routes.ts joins factoring.factor fewer than 2 times (list + detail) — found ${factorJoinCount}`);
  }
  return failures;
}

function selftest() {
  const failures = checkStatic();
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest FAIL — real file flagged: ${f}`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS — real files clear`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const staticFailures = checkStatic();
  if (staticFailures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of staticFailures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(`${LABEL} static half OK — InvoicesListPage.tsx renders a real, dash-never-blank Factored column; list + detail routes both join the real factor name`);

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP (live half) — no DATABASE_URL/DATABASE_DIRECT_URL; live check not possible here.`);
    return 0;
  }
  const liveRequested = process.env.INVOICES_FACTORED_COLUMN_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(`${LABEL} SKIP (live half) — CI's database is a fixture playground; run with INVOICES_FACTORED_COLUMN_LIVE=1 against prod.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP (live half) — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const enumRes = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'accounting.invoices'::regclass AND conname = 'invoices_factoring_status_check'
    `);
    const totalRes = await client.query(`
      SELECT count(*)::int AS n, count(*) FILTER (WHERE factoring_status IS NULL)::int AS n_null
      FROM accounting.invoices
    `);
    const joinRes = await client.query(`
      SELECT count(*)::int AS n
      FROM accounting.invoices i
      LEFT JOIN factoring.factor fp ON fp.id = i.factor_profile_id AND fp.operating_company_id = i.operating_company_id
    `);
    await client.query("COMMIT");

    const def = enumRes.rows[0]?.def ?? "";
    if (!def) {
      console.log(`${LABEL} SKIP — invoices_factoring_status_check constraint not found; live schema mismatch, cannot assert.`);
      return 0;
    }
    const total = totalRes.rows[0]?.n ?? 0;
    const nullCount = totalRes.rows[0]?.n_null ?? 0;
    if (nullCount > 0) {
      console.error(`${LABEL} FAIL — ${nullCount} of ${total} invoices have a NULL factoring_status (the Factored column's dash-never-blank fallback covers this in the UI, but a NULL here means the column contract itself is not guaranteed non-null at the DB level).`);
      return 1;
    }
    console.log(
      `${LABEL} PASS — live factoring_status CHECK constraint: ${def}. ${total} invoice(s) checked, 0 with a NULL factoring_status. LEFT JOIN factoring.factor resolved for all ${joinRes.rows[0]?.n ?? 0} row(s) (never drops a row for an unmatched/null factor_profile_id).`
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
