#!/usr/bin/env node
// UPDATED 2026-09-05 (CC-2): this guard's original assertion (import
// expense-category-map/resolver.service.js, call resolveAccountForCategory(..., "maintenance",
// categoryCode)) checked a resolver shape that PR #19507 (97c844afd1, 2026-09-01) deliberately
// REMOVED — the WO-close bill-line account is now resolved ONCE per bill via resolveRoleAccount
// (accounting/coa-roles/resolver.service.js, "fixed_asset_default" / "heavy_repair_expense"),
// replacing the old per-line category-default resolution entirely (that PR's own body: "removing
// ... resolveAccountForCategory import"). Left unfixed, this guard permanently reddened
// build-typecheck for a correct, already-shipped, already-documented change — the same class as
// CLS-GUARD-LITERAL-GUC (a guard punishing a legitimate fix). scripts/verify-capitalize-
// threshold-7000.mjs's wiringErrors() already asserts the CURRENT shape in full, including a
// regression sentinel against the exact old resolveAccountForCategory("maintenance", ...) call —
// this guard is narrowed to stop duplicating/contradicting that and instead check only what it
// alone still owns: the poster actually posts the bill through the shared posting backbone.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const REL_PATH = "apps/backend/src/accounting/maintenance-posting/poster.service.ts";

function collectFailures(root) {
  const posterPath = path.join(root, REL_PATH);
  const failures = [];
  if (!fs.existsSync(posterPath)) {
    failures.push(`missing ${REL_PATH}`);
    return failures;
  }
  const source = fs.readFileSync(posterPath, "utf8");
  if (!/from ["']\.\.\/coa-roles\/resolver\.service\.js["']/.test(source) || !/resolveRoleAccount/.test(source)) {
    failures.push(`${REL_PATH} must resolve the WO-close bill-line account via resolveRoleAccount (coa-roles resolver)`);
  }
  // Regression sentinel: the exact defect PR #19507 fixed must not return.
  if (/resolveAccountForCategory\(\s*input\.operating_company_id,\s*["']maintenance["']/.test(source)) {
    failures.push(`${REL_PATH} must not resolve the WO-close bill-line account via the maintenance category default (resolveAccountForCategory) — see scripts/verify-capitalize-threshold-7000.mjs`);
  }
  if (!/postSourceTransaction\(/.test(source) || !/source_transaction_type:\s*"bill"/.test(source)) {
    failures.push(`${REL_PATH} must post the bill via the shared posting backbone (postSourceTransaction, source_transaction_type: "bill")`);
  }
  return failures;
}

function fail(messages) {
  console.error("verify:maintenance-posting-uses-resolver — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(repoRoot);
  if (baseline.length) fail(baseline);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maint-posting-resolver-guard-"));
  try {
    const tmpDir = path.join(tmpRoot, path.dirname(REL_PATH));
    fs.mkdirSync(tmpDir, { recursive: true });
    // Planted stub reproduces the exact pre-#19507 defect: no resolveRoleAccount, the old
    // category-default call present, no posting-backbone bill post.
    fs.writeFileSync(
      path.join(tmpRoot, REL_PATH),
      `const accountId = resolveAccountForCategory(input.operating_company_id, "maintenance", categoryCode);\n`
    );
    const planted = collectFailures(tmpRoot);
    if (planted.length !== 3) {
      console.error(
        `verify:maintenance-posting-uses-resolver — SELFTEST FAIL: expected 3 problems on the planted pre-fix stub, got ${planted.length}: ${JSON.stringify(planted)}`
      );
      process.exit(1);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log("verify:maintenance-posting-uses-resolver — SELFTEST OK");
} else {
  const failures = collectFailures(repoRoot);
  if (failures.length > 0) fail(failures);
  console.log("verify:maintenance-posting-uses-resolver — OK");
}
