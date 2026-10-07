#!/usr/bin/env node
// BANK-F9341 (2026-10-02) — a bank-statement upload is idempotent. The CSV inserter never wrote dedup_hash, so the partial
// unique index (bank_account_id, dedup_hash) could not see it and re-uploading a file landed every line twice (prod USMCA:
// 399 of 475 csv_import lines carried no hash).
//
// Static: the inserter writes dedup_hash, lands a row only while fewer than `occurrence` identical live rows exist, and the
// upload route passes a per-file occurrence ordinal built from the same identity text.
// Live (DATABASE_URL): no csv_import line created after the fix shipped carries a NULL dedup_hash; positive control —
// csv_import lines exist at all. A live check that cannot connect FAILS. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


export const REQUIRES_LIVE_DB = "Neon live verification required";
const LABEL = "verify-csv-statement-upload-idempotent";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  ingest: "apps/backend/src/banking/transaction-ingestion.ts",
  route: "apps/backend/src/banking/reconciliation.routes.ts",
};
const SHIPPED_AT = "2026-10-02T21:00:00Z";

export function check(src) {
  const fails = [];
  const fn = src.ingest.slice(src.ingest.indexOf("export async function insertCsvStatementBankTransaction"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 2);
  if (!/source_ref,\n\s*dedup_hash,\n\s*created_at,/.test(body)) fails.push(`${F.ingest}: insertCsvStatementBankTransaction does not write dedup_hash`);
  if (!/\) < \$13::int/.test(body)) fails.push(`${F.ingest}: the "fewer than occurrence identical live rows" predicate is gone`);
  if (!/bt\.voided_at IS NULL/.test(body)) fails.push(`${F.ingest}: the identical-row count no longer ignores voided rows`);
  if (!/occurrence,\n/.test(src.route) || !/statementRowIdentityText\(rawDesc\)/.test(src.route)) {
    fails.push(`${F.route}: the upload route no longer passes a per-file occurrence built from statementRowIdentityText`);
  }
  return fails;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(ROOT, p), "utf8")]));

if (process.argv.includes("--selftest")) {
  const good = read();
  const plants = [
    ["hash not written", { ingest: good.ingest.replace(/        dedup_hash,\n        created_at,/, "        created_at,") }],
    ["count predicate removed", { ingest: good.ingest.replace(") < $13::int", ") < 999999") }],
    ["route drops occurrence", { route: good.route.replace("          occurrence,\n", "") }],
  ];
  if (check(good).length) { console.error(`${LABEL} --selftest FAIL: tree not clean: ${check(good).join("; ")}`); process.exit(1); }
  const missed = plants.filter(([, o]) => check({ ...good, ...o }).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) {
  console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL (a live guard that cannot run is a FAIL)`);
  process.exit(1);
}
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = (await c.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at > $1::timestamptz)::int AS since,
            count(*) FILTER (WHERE created_at > $1::timestamptz AND dedup_hash IS NULL)::int AS since_unhashed
       FROM banking.bank_transactions WHERE source = 'csv_import'`,
    [SHIPPED_AT]
  )).rows[0];
  await c.query("ROLLBACK");
  if (r.total === 0) { console.error(`${LABEL}: FAIL — positive control: no csv_import line exists, the instrument cannot see the table`); process.exit(1); }
  if (r.since_unhashed > 0) {
    console.error(`${LABEL}: LIVE FAIL — ${r.since_unhashed} csv_import line(s) created after ${SHIPPED_AT} carry no dedup_hash; a re-upload would duplicate them`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — static 4/4; live: ${r.since} csv_import line(s) since ${SHIPPED_AT}, 0 unhashed; positive control ${r.total} csv_import lines`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
