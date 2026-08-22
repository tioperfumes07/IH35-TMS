#!/usr/bin/env node
/**
 * ACCT-F5766 — /accounting/receipts will NEVER show an expense/bill attachment uploaded through the
 * product's own normal upload flow if it carries category 'vendor_invoice'. Live-verified on Neon prod:
 * 2 of 3 real accounting-scope attachments for entity_type IN ('expense','bill') carry category
 * 'vendor_invoice' (the other carries 'receipt'), but receipts.routes.ts's RECEIPT_SCOPE_SQL only ever
 * matched category='receipt' for that entity_type set — a structural allowlist gap, not a per-row bug.
 *
 * INVARIANT (static — no database): RECEIPT_SCOPE_SQL's expense/bill branch must match BOTH 'receipt'
 * and 'vendor_invoice' (via an ANY(...) set, not a single '=' literal), and must not silently drop the
 * 'receipt' category it already correctly matched.
 *
 * Self-test: node scripts/verify-receipts-scope-includes-vendor-invoice-category.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/accounting/receipts.routes.ts";
const LABEL = "verify-receipts-scope-includes-vendor-invoice-category";

export function checkSource(src) {
  const problems = [];

  const match = src.match(/RECEIPT_SCOPE_SQL\s*=\s*`([\s\S]*?)`;/);
  if (!match) {
    problems.push("RECEIPT_SCOPE_SQL constant not found");
    return problems;
  }
  const sql = match[1];

  const expenseBillBranch = sql.match(/entity_type IN \('expense','bill'\)[\s\S]*?\)/);
  if (!expenseBillBranch) {
    problems.push("no entity_type IN ('expense','bill') branch found in RECEIPT_SCOPE_SQL");
    return problems;
  }
  const branch = expenseBillBranch[0];

  if (!/category\s*=\s*ANY\(/.test(branch)) {
    problems.push("expense/bill branch still uses a single '=' category match instead of ANY(...) — cannot carry more than one category");
  }
  if (!/receipt/.test(branch)) {
    problems.push("expense/bill branch no longer matches 'receipt' — regression, not just an addition");
  }
  if (!/vendor_invoice/.test(branch)) {
    problems.push("expense/bill branch does not match 'vendor_invoice' — the real gap this guard exists for");
  }

  return problems;
}

function selftest() {
  const good = `
    const RECEIPT_SCOPE_SQL = \`(
      (a.entity_type IN ('expense','bill') AND a.category = ANY('{receipt,vendor_invoice}'::text[]))
      OR (a.entity_type = 'payment' AND a.category = ANY('{check_image,receipt}'::text[]))
    )\`;
  `;
  const goodProblems = checkSource(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    good.replace("a.category = ANY('{receipt,vendor_invoice}'::text[])", "a.category = 'receipt'"),
    good.replace("a.category = ANY('{receipt,vendor_invoice}'::text[])", "a.category = ANY('{vendor_invoice}'::text[])"),
    good.replace("a.category = ANY('{receipt,vendor_invoice}'::text[])", "a.category = ANY('{receipt}'::text[])"),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (checkSource(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const targetPath = path.join(ROOT, TARGET);
if (!fs.existsSync(targetPath)) {
  console.error(`[${LABEL}] FAILED — ${TARGET} not found`);
  process.exit(1);
}
const src = fs.readFileSync(targetPath, "utf8");
const failures = checkSource(src);
if (failures.length) {
  console.error(`[${LABEL}] FAILED (${TARGET}):\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${TARGET}'s RECEIPT_SCOPE_SQL matches both 'receipt' and 'vendor_invoice' for expense/bill attachments`);
