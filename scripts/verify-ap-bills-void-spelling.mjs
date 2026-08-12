#!/usr/bin/env node
/**
 * LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS — static ratchet.
 *
 * accounting.bills.status carries 'void', never 'voided' (confirmed live: DISTINCT status =
 * paid/draft/void/partial/unpaid). Two AP-reading queries excluded bills via
 * `status NOT IN ('voided', 'draft')` — a clause that has never matched a single row, because no bill
 * has ever carried the spelling it checks for. Each query happened to have a separate `revoked_at IS
 * NULL` check that saved it from a LIVE defect today, but the status clause itself was purely
 * decorative — a phantom control, same class this repo has hit before (near-miss spelling used as a
 * semantic detector).
 *
 * INVARIANT (static — no database): both ap-aging.service.ts's AP_AGING_OPEN_BILLS_SQL and
 * consolidated-statements.service.ts's bills query must exclude 'void' (not only 'voided') from
 * accounting.bills.status.
 *
 * Self-test: node scripts/verify-ap-bills-void-spelling.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-ap-bills-void-spelling";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGETS = [
  "apps/backend/src/accounting/ap-aging.service.ts",
  "apps/backend/src/accounting/consolidated-statements.service.ts",
];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
}

export function checkVoidSpelling(src) {
  const code = stripComments(src);
  const match = /b\.status\s+NOT IN\s*\(([^)]*)\)/i.exec(code);
  if (!match) return { ok: false, reason: "b.status NOT IN (...) clause not found — matcher is inert" };
  const list = match[1];
  const hasVoided = /'voided'/.test(list);
  // The literal 'void' must appear as its OWN quoted token, not just as a substring of 'voided'.
  const tokens = list.split(",").map((t) => t.trim());
  const hasVoidToken = tokens.includes("'void'");
  if (!hasVoided) return { ok: false, reason: "b.status NOT IN (...) is missing 'voided' entirely (unexpected regression)" };
  if (!hasVoidToken) {
    return {
      ok: false,
      reason: "b.status NOT IN (...) excludes 'voided' but not 'void' — accounting.bills.status carries 'void', so this clause is decorative",
    };
  }
  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    WHERE b.operating_company_id = $1::uuid
      AND b.status NOT IN ('void', 'voided', 'draft')
  `;
  const goodResult = checkVoidSpelling(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
    WHERE b.operating_company_id = $1::uuid
      AND b.status NOT IN ('voided', 'draft')
  `;
  const regressedResult = checkVoidSpelling(regressed);
  if (regressedResult.ok) fail("selftest: regressed fixture (missing 'void') should FAIL but passed");

  const commentTrap = `
    -- should be status NOT IN ('void', 'voided', 'draft')
    WHERE b.operating_company_id = $1::uuid
      AND b.status NOT IN ('voided', 'draft')
  `;
  const trapResult = checkVoidSpelling(commentTrap);
  if (trapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const problems = [];
  for (const target of TARGETS) {
    const filePath = path.join(ROOT, target);
    if (!fs.existsSync(filePath)) {
      problems.push(`${target}: file not found`);
      continue;
    }
    const src = fs.readFileSync(filePath, "utf8");
    const result = checkVoidSpelling(src);
    if (!result.ok) problems.push(`${target}: ${result.reason}`);
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s)`);
  }
  console.log(`[${LABEL}] PASS — both AP bills queries exclude 'void' (not only 'voided') from accounting.bills.status`);
}
