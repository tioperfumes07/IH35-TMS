#!/usr/bin/env node
/**
 * GUARD: the Relay CSV importer must ingest ONLY settled fuel-purchase rows (type=code),
 * never deposit-funding rows (type=deposit) and never canceled/voided pre-auths.
 *
 * Root cause it locks (2026-07-12): an earlier importer summed type=code (fuel pumped, $569,502.99)
 * with type=deposit (money funded into Relay, $590,053) → a bogus ~$1.16M "spend". Fuel pumped,
 * account funding, and bank payments are THREE distinct layers that must never be conflated.
 * Deposits belong to the Relay-wallet ledger (doc 21 Part B), NOT the fuel-transaction table.
 *
 * --selftest exercises the assertions against inline fixtures (no repo read).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = path.join(__dirname, "..", "apps", "backend", "src", "integrations", "relay-payments", "relay-fuel-csv-import.routes.ts");

function assertSource(src, file) {
  const errors = [];
  // 1. Must gate on type === "code" and reject everything else.
  if (!/rowType\s*!==\s*"code"\s*\)\s*return null/.test(src)) {
    errors.push(`${file}: missing the \`if (rowType !== "code") return null\` deposit-exclusion guard`);
  }
  // 2. Must read the CSV `type` column (case-insensitively) before that check.
  if (!/S\(g\("type"\)\)/.test(src)) {
    errors.push(`${file}: does not read the CSV "type" column to distinguish code vs deposit`);
  }
  // 3. Must reject canceled/voided pre-auths.
  if (!/rowStatus\s*===\s*"canceled"/.test(src) || !/S\(g\("status"\)\)/.test(src)) {
    errors.push(`${file}: missing the canceled/voided status exclusion (spec doc 24)`);
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `const rowType = (S(g("type")) ?? "").toLowerCase();
  if (rowType !== "code") return null;
  const rowStatus = (S(g("status")) ?? "").toLowerCase();
  if (rowStatus === "canceled" || rowStatus === "cancelled") return null;`;
  const badDeposit = `const created_at = toIso(g("processing time"), g("work_date"));`;
  const eGood = assertSource(good, "fixture-good");
  const eBad = assertSource(badDeposit, "fixture-bad");
  if (eGood.length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", eGood); process.exit(1); }
  if (eBad.length === 0) { console.error("SELFTEST FAIL: bad fixture (no guard) passed"); process.exit(1); }
  console.log("verify-relay-csv-code-rows-only selftest OK");
  process.exit(0);
}

if (!fs.existsSync(ROUTE)) {
  console.error(`GUARD FAIL: expected importer not found at ${ROUTE}`);
  process.exit(1);
}
const src = fs.readFileSync(ROUTE, "utf8");
const errors = assertSource(src, path.relative(path.join(__dirname, ".."), ROUTE));
if (errors.length) {
  console.error("GUARD FAIL — Relay CSV importer must ingest only settled type=code fuel rows:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-relay-csv-code-rows-only OK — importer gates on type=code + excludes canceled/voided");
