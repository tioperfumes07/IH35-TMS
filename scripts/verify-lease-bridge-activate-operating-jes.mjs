#!/usr/bin/env node
/**
 * LEASE-BRIDGE (claim 1880) — activate posts balanced ASC 842 operating JEs.
 *
 * Owner law: when a lease activates, post TRK rental income + TRANSP/USMCA rent expense from the
 * payment schedule + rental_income / rent_expense control roles. LEASE_GL_POSTING_ENABLED may be ON;
 * QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED stay OFF (parallel books).
 *
 * Static guard (CI):
 *   1. activate route calls postOperatingActivationEntries
 *   2. assertBalanced gates lease JE insert (first balanced JE)
 *   3. rent_expense is a first-class CoA role (resolver + migration)
 *   4. migration never enables QBO push flags
 *   5. --selftest planted defect fails closed
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const routesPath = join(ROOT, "apps/backend/src/accounting/lease-asc842/lease-posting.routes.ts");
const postingPath = join(ROOT, "apps/backend/src/accounting/lease-asc842/lease-posting.service.ts");
const mathPath = join(ROOT, "apps/backend/src/accounting/lease-asc842/lease.math.ts");
const resolverPath = join(ROOT, "apps/backend/src/accounting/coa-roles/resolver.service.ts");
const migrationPath = join(ROOT, "db/migrations/202611031200_lease_bridge_rent_expense_coa_role.sql");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function assertContains(hay, needle, label) {
  if (!hay.includes(needle)) fail(`${label}: missing ${JSON.stringify(needle)}`);
}

function stripTsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

function checkWiring() {
  const routes = stripTsComments(readFileSync(routesPath, "utf8"));
  const posting = stripTsComments(readFileSync(postingPath, "utf8"));
  const math = stripTsComments(readFileSync(mathPath, "utf8"));
  const resolver = stripTsComments(readFileSync(resolverPath, "utf8"));

  if (!existsSync(migrationPath)) {
    fail("missing rent_expense migration 202611031200_lease_bridge_rent_expense_coa_role.sql");
  }
  const migExec = stripSqlComments(readFileSync(migrationPath, "utf8"));

  assertContains(routes, "postOperatingActivationEntries", "activate route");
  assertContains(routes, "leases/:lease_id/activate", "activate path");
  assertContains(posting, "export async function postOperatingActivationEntries", "activation poster");
  assertContains(posting, "export async function postOperatingLesseeRentPeriod", "lessee poster");
  assertContains(posting, "assertBalanced", "balanced gate");
  assertContains(posting, '"rent_expense"', "lessee role resolve");
  assertContains(posting, "rental_income", "lessor role");
  assertContains(math, '"rent_expense"', "idempotency kind");
  assertContains(resolver, '"rent_expense"', "COA_ROLE_VALUES");
  assertContains(migExec, "'rent_expense'", "migration CHECK/bind");

  if (
    /QBO_JE_PUSH_ENABLED[\s\S]{0,120}\btrue\b/i.test(migExec) ||
    /QBO_ENTITY_PUSH_ENABLED[\s\S]{0,120}\btrue\b/i.test(migExec)
  ) {
    fail("migration must not enable QBO push flags");
  }

  const assertIdx = posting.indexOf("async function postLeaseJournalEntry");
  const assertBalancedIdx = posting.indexOf("assertBalanced(input.lines)", assertIdx);
  if (assertIdx < 0 || assertBalancedIdx < 0 || assertBalancedIdx - assertIdx > 400) {
    fail("postLeaseJournalEntry must call assertBalanced before insert (first balanced JE gate)");
  }

  console.log("PASS: LEASE-BRIDGE activate operating JE wiring + rent_expense role + QBO push stay-off");
}

const isSelftest = process.argv.includes("--selftest");

if (isSelftest) {
  const original = readFileSync(routesPath, "utf8");
  const planted = original
    .replace(/postOperatingActivationEntries,/g, "")
    .replace(/const activation = await postOperatingActivationEntries\([\s\S]*?\);/m, "const activation = null;");
  writeFileSync(routesPath, planted);
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (r.status === 0) {
      fail(`selftest expected FAIL, got PASS\n${r.stdout}\n${r.stderr}`);
    }
    console.log("PASS: planted defect (activation unwired) fails closed");
  } finally {
    writeFileSync(routesPath, original);
  }
} else {
  checkWiring();
}
