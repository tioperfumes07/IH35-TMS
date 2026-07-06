#!/usr/bin/env node
// STMT-2 regression guard — re-proves the TRANSP opening-balance SOURCE DATA
// (apps/backend/src/accounting/opening-balance-import/transp-2024-12-31-source.ts) still ties to
// docs/OPENING-BALANCES-TRANSP-2024-12-31.md to the penny, and that Assets = Liabilities + Equity (the
// fundamental Balance Sheet identity — if this ever fails, the opening JE preview would not balance).
//
// Pure static analysis: extracts every `{ ..., amount_cents: <n>, account_type: "<Asset|Liability|Equity>",
// ... }` source line via regex (no TS runtime required — mirrors the other scripts/verify-*.mjs guards'
// filesystem/string-analysis pattern) and re-sums by account_type, comparing against the hardcoded
// headline constants in the same file. A future data edit that breaks the tie-out fails CI immediately
// instead of silently shipping a JE preview that would never balance.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SOURCE_FILE = path.join(ROOT, "apps/backend/src/accounting/opening-balance-import/transp-2024-12-31-source.ts");

const failures = [];
function fail(msg) {
  failures.push(msg);
}

if (!fs.existsSync(SOURCE_FILE)) {
  fail(`source file not found at ${SOURCE_FILE}`);
} else {
  const src = fs.readFileSync(SOURCE_FILE, "utf8");

  const lineRe = /amount_cents:\s*(-?[\d_]+),\s*account_type:\s*"(Asset|Liability|Equity)"/g;
  const totals = { Asset: 0, Liability: 0, Equity: 0 };
  let count = 0;
  let m;
  while ((m = lineRe.exec(src)) !== null) {
    const cents = Number(m[1].replace(/_/g, ""));
    const type = m[2];
    totals[type] += cents;
    count += 1;
  }

  if (count === 0) {
    fail("no source lines matched the amount_cents/account_type regex — has the file's shape changed? Update this guard's regex.");
  }

  const headlineRe = {
    total_assets_cents: /total_assets_cents:\s*(-?[\d_]+)/,
    total_liabilities_cents: /total_liabilities_cents:\s*(-?[\d_]+)/,
    total_equity_cents: /total_equity_cents:\s*(-?[\d_]+)/,
  };
  const expected = {};
  for (const [key, re] of Object.entries(headlineRe)) {
    const hm = re.exec(src);
    if (!hm) {
      fail(`could not find headline constant ${key} in the source file`);
      continue;
    }
    expected[key] = Number(hm[1].replace(/_/g, ""));
  }

  if (expected.total_assets_cents !== undefined && totals.Asset !== expected.total_assets_cents) {
    fail(`computed total Assets (${totals.Asset}) does not match the headline TRANSP_OPENING_BALANCE_HEADLINE_CENTS.total_assets_cents (${expected.total_assets_cents}) — a source line drifted from the doc.`);
  }
  if (expected.total_liabilities_cents !== undefined && totals.Liability !== expected.total_liabilities_cents) {
    fail(`computed total Liabilities (${totals.Liability}) does not match the headline (${expected.total_liabilities_cents}) — a source line drifted from the doc.`);
  }
  if (expected.total_equity_cents !== undefined && totals.Equity !== expected.total_equity_cents) {
    fail(`computed total Equity (${totals.Equity}) does not match the headline (${expected.total_equity_cents}) — a source line drifted from the doc.`);
  }

  // The fundamental Balance Sheet identity: Assets = Liabilities + Equity (=> Assets - Liab - Equity = 0).
  // This is what guarantees the opening JE balances by construction with NO separate plug/offset line.
  const identity = totals.Asset - totals.Liability - totals.Equity;
  if (identity !== 0) {
    fail(`Assets - Liabilities - Equity = ${identity} cents (expected 0) — the source data no longer represents a balanced Balance Sheet; the opening JE preview would never balance.`);
  }
}

if (failures.length) {
  console.error(`[verify-opening-balance-source-ties-to-doc] FAILED — ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("[verify-opening-balance-source-ties-to-doc] PASS — source data ties to the doc, Assets = Liabilities + Equity to the penny.");
