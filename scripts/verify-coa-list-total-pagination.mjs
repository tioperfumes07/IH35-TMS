#!/usr/bin/env node
// 0091-g9-h6 regression guard.
//
// The Chart-of-Accounts management list (GET /api/v1/catalogs/accounts) paged with LIMIT/OFFSET but
// returned only `{ accounts }` — no total row count and no has_more flag. A UI that caps at limit=50
// then has no way to size a pager, so the oldest accounts are unreachable. This guard fails if the
// list handler stops returning a `total` count and a `has_more` flag (both must be present so the
// client can page the full set).
//
// Wired into verify:pre-commit via scripts/verify-steps/116-verify-coa-list-total-pagination.mjs.
// Self-test: node scripts/verify-coa-list-total-pagination.mjs --selftest
// LINKAGE: N/A (enforcement infra). Additive only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/catalogs/accounts.routes.ts";

export function check(src) {
  const failures = [];
  // A COUNT(*) over the filtered set must back the total.
  if (!/COUNT\(\*\)\s*::int\s+AS\s+total\s+FROM\s+catalogs\.accounts/i.test(src)) {
    failures.push(
      "GET /catalogs/accounts must run a COUNT(*)::int AS total over catalogs.accounts to size the pager",
    );
  }
  // The list response must expose has_more (paging cursor) and total.
  if (!/has_more\s*:/.test(src)) {
    failures.push("GET /catalogs/accounts response must include a `has_more` flag");
  }
  if (!/\btotal\s*:/.test(src)) {
    failures.push("GET /catalogs/accounts response must include a `total` count");
  }
  return failures;
}

export function run() {
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  return check(src);
}

if (process.argv.includes("--selftest")) {
  const good = `
    const countRes = await client.query("SELECT COUNT(*)::int AS total FROM catalogs.accounts");
    return { accounts: result.rows, total: result.total, has_more: offset + result.rows.length < result.total };
  `;
  const bad = `const res = await client.query("SELECT * FROM catalogs.accounts LIMIT $1 OFFSET $2"); return { accounts: res.rows };`;
  const checks = [
    ["total+has_more shape passes", check(good).length === 0],
    ["bare { accounts } is caught", check(bad).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:coa-list-total-pagination --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:coa-list-total-pagination --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:coa-list-total-pagination FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:coa-list-total-pagination PASS (CoA list returns total + has_more)");
}
