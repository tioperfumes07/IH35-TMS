#!/usr/bin/env node
/**
 * verify-account-merge-records-failclosed (KR-03 / ACCT-R-03)
 *
 * LIVE (GUARD 2026-07-27): to_regclass('catalogs.account_merge_records') = NULL. The CoA merge path
 * used to INSERT unguarded → every merge attempt is a raw 42P01. This is the most exposed KNOWN_RED
 * item (BLOCKS-KNOWN-RED-SCHEMA-AHEAD-OF-CODE.txt KR-03).
 *
 * REQUIRED: mergeAccountsOnClient proves table presence via to_regclass BEFORE any INSERT into
 * catalogs.account_merge_records, and fails with E_MERGE_SCHEMA_NOT_APPLIED (honest 503), naming
 * migration 202608060000. Do NOT allowlist this — when the migration is applied, keep the guard;
 * the to_regclass check simply returns true.
 *
 * Usage: node scripts/verify-account-merge-records-failclosed.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SRC = "apps/backend/src/catalogs/account-merge.service.ts";

export function assertFailClosed(src) {
  const problems = [];
  const insertAt = src.indexOf("INSERT INTO catalogs.account_merge_records");
  if (insertAt < 0) {
    problems.push("INSERT INTO catalogs.account_merge_records not found — update path if the merge writer moved");
    return problems;
  }
  const before = src.slice(0, insertAt);
  if (!/to_regclass\s*\(\s*\$1::text\s*\)/.test(before) && !/to_regclass\s*\([^)]*account_merge_records/.test(before)) {
    problems.push("no to_regclass('catalogs.account_merge_records') check before INSERT");
  }
  if (!before.includes("catalogs.account_merge_records")) {
    problems.push("to_regclass probe must name catalogs.account_merge_records before INSERT");
  }
  if (!/E_MERGE_SCHEMA_NOT_APPLIED/.test(before)) {
    problems.push("missing E_MERGE_SCHEMA_NOT_APPLIED fail-loud code before INSERT");
  }
  if (!/202608060000/.test(before)) {
    problems.push("fail-loud details must name migration 202608060000");
  }
  if (!/AccountMergeError\(\s*"E_MERGE_SCHEMA_NOT_APPLIED"\s*,\s*503/.test(before)) {
    problems.push("schema-missing path must use AccountMergeError(\"E_MERGE_SCHEMA_NOT_APPLIED\", 503, …)");
  }
  return problems;
}

function run() {
  const abs = resolve(process.cwd(), SRC);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${SRC} missing`);
    return false;
  }
  const problems = assertFailClosed(readFileSync(abs, "utf8"));
  if (problems.length) {
    console.error(`[verify-account-merge-records-failclosed] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log("[verify-account-merge-records-failclosed] OK — INSERT is preceded by to_regclass fail-closed 503");
  return true;
}

function selftest() {
  const good = `
    const reg = await client.query(\`SELECT to_regclass($1::text) IS NOT NULL AS ok\`, ["catalogs.account_merge_records"]);
    if (!present) throw new AccountMergeError("E_MERGE_SCHEMA_NOT_APPLIED", 503, { migration: "202608060000_acct_r03_catalogs_account_merge_records.sql" });
    INSERT INTO catalogs.account_merge_records (
  `;
  const bad = `INSERT INTO catalogs.account_merge_records (operating_company_id) VALUES ($1)`;
  const gp = assertFailClosed(good);
  const bp = assertFailClosed(bad);
  if (gp.length) {
    console.error("SELFTEST FAIL good:", gp);
    process.exit(1);
  }
  if (!bp.length) {
    console.error("SELFTEST FAIL bad accepted");
    process.exit(1);
  }
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
