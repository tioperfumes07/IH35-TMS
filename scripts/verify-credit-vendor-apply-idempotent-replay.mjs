#!/usr/bin/env node
/**
 * ACCT-F5618 regression guard — both credit-memos.routes.ts (AR) and vendor-credits.routes.ts (AP)
 * "apply" routes must resolve an idempotency_key by looking up the existing application BEFORE the
 * over-apply check and BEFORE inserting, so a retried request (double-click, client timeout+retry)
 * replays the original successful result instead of a fresh INSERT, a stale over-apply rejection, or
 * a 23505 unique-violation 500. Mirrors settlement-posting.service.ts's own findExistingPostedJe
 * pre-check pattern rather than catching the constraint violation after the fact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-credit-vendor-apply-idempotent-replay";
const SELFTEST = process.argv.includes("--selftest");

const TARGETS = [
  {
    file: "apps/backend/src/accounting/credit-memos.routes.ts",
    table: "accounting.credit_memo_applications",
    varKey: "appReq.idempotency_key",
    newApplicationsVar: "newApplications",
  },
  {
    file: "apps/backend/src/accounting/vendor-credits.routes.ts",
    table: "accounting.vendor_credit_applications",
    varKey: "app.idempotency_key",
    newApplicationsVar: "newApplications",
  },
];

function assertOne(target, src) {
  const problems = [];
  if (!src.includes(`WHERE operating_company_id = $1::uuid AND idempotency_key = $2 AND voided_at IS NULL`)) {
    problems.push(`${target.file}: missing the pre-insert idempotency lookup query.`);
  }
  if (!src.includes(`SELECT id FROM ${target.table}`)) {
    problems.push(`${target.file}: idempotency lookup does not query ${target.table}.`);
  }
  if (!src.includes(`const ${target.newApplicationsVar}:`)) {
    problems.push(`${target.file}: missing the ${target.newApplicationsVar} split (new vs. idempotent-replay applications).`);
  }
  // The over-apply check must run against newApplications, not the raw request body -- otherwise a
  // retry of an already-applied request stale-rejects against a balance that already moved.
  if (!new RegExp(`${target.newApplicationsVar}\\.reduce\\(\\(s, a\\) => s \\+ a\\.applied_cents, 0\\)`).test(src)) {
    problems.push(`${target.file}: totalApplying is not computed from ${target.newApplicationsVar} -- the over-apply check would stale-reject a retry.`);
  }
  return problems;
}

function assertAll() {
  const problems = [];
  for (const target of TARGETS) {
    const src = fs.readFileSync(path.join(ROOT, target.file), "utf8");
    problems.push(...assertOne(target, src));
  }
  return problems;
}

if (SELFTEST) {
  for (const target of TARGETS) {
    const filePath = path.join(ROOT, target.file);
    const src = fs.readFileSync(filePath, "utf8");

    const dropped = src.replace(
      `const ${target.newApplicationsVar}: typeof body.data.applications = [];`,
      ""
    );
    if (dropped === src) {
      console.error(`${LABEL} SELFTEST SETUP FAILED: ${target.file} mutation string did not match live source`);
      process.exit(1);
    }
    const dropProblems = assertOne(target, dropped);
    if (!dropProblems.length) {
      console.error(`${LABEL} SELFTEST FAILED: dropping ${target.newApplicationsVar} on ${target.file} not caught`);
      process.exit(1);
    }
  }

  const live = assertAll();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — both credit-memo (AR) and vendor-credit (AP) apply routes replay an idempotent retry instead of double-applying or 500ing`);
