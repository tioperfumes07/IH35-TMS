#!/usr/bin/env node
/**
 * 18365-verify-invoice-number-is-invoice-dash-load.mjs
 *
 * ROUND 443.8 (CC-1, 2026-10-10). Owner ruling: every from-load invoice is numbered
 * "<invoice-number>-<load-number>" — e.g. 3-13508, 59-13577, 119-13600, 0-13498.
 *
 * Rules verified (static, no DB):
 *   1. INVOICE_DISPLAY_ID_PATTERN in display-id.ts includes the ^[0-9]{1,6}-[0-9]{1,12}$ alternative.
 *   2. resolveInvoiceDisplayId has an opts.loadNumber branch (from-load context).
 *   3. Typed digits (requestedDisplayId = N) form <N>-<loadNumber> in that branch.
 *   4. Blank + authorizedZeroRevenue returns 0-<loadNumber>.
 *   5. Blank non-$0 allocates MAX(split_part ...)+1 with the 0-exclusion filter.
 *   6. from-load.ts passes opts: { loadNumber, authorizedZeroRevenue } instead of autoFallback.
 */
import { readFileSync } from "node:fs";

const DISPLAY_ID_PATH = "apps/backend/src/accounting/display-id.ts";
const FROM_LOAD_PATH = "apps/backend/src/accounting/from-load.ts";

function loadFile(p) {
  return readFileSync(p, "utf8");
}

export function collectFailures(displayIdSrc = loadFile(DISPLAY_ID_PATH), fromLoadSrc = loadFile(FROM_LOAD_PATH)) {
  const failures = [];

  // Rule 1: INVOICE_DISPLAY_ID_PATTERN regex literal includes invoice-dash-load alternative.
  // Match only the constant declaration line to avoid false positives from SQL strings in the function body.
  const patternLine = displayIdSrc.match(/export const INVOICE_DISPLAY_ID_PATTERN\s*=\s*(\/\^.*\$\/);/)?.[1] ?? "";
  if (!/\[0-9\]\{1,6\}-\[0-9\]\{1,12\}/.test(patternLine)) {
    failures.push("INVOICE_DISPLAY_ID_PATTERN does not include [0-9]{1,6}-[0-9]{1,12} alternative (migration + pattern update required)");
  }

  // Rule 2: opts.loadNumber branch exists
  if (!/opts\?\.loadNumber/.test(displayIdSrc)) {
    failures.push("resolveInvoiceDisplayId does not have opts?.loadNumber branch — from-load invoices cannot get <N>-<load> format");
  }

  // Rule 3: typed digits form <typed>-<load>
  if (!displayIdSrc.includes("`${typedDigits}-${loadNum}`")) {
    failures.push("resolveInvoiceDisplayId typed-digits path does not compose `${typedDigits}-${loadNum}` — typed invoice number will not be prepended to load number");
  }

  // Rule 4: blank $0 path returns 0-<load>
  if (!displayIdSrc.includes("`0-${loadNum}`")) {
    failures.push("resolveInvoiceDisplayId does not have `0-${loadNum}` for authorized $0 invoices (ROUND 443.1 $0 path)");
  }

  // Rule 5: blank non-$0 uses MAX(split_part)+1 with 0-exclusion
  if (!displayIdSrc.includes("split_part(display_id, '-', 1)::int")) {
    failures.push("resolveInvoiceDisplayId blank non-$0 path does not use split_part(display_id, '-', 1)::int MAX allocator");
  }
  if (!displayIdSrc.includes("split_part(display_id, '-', 1) <> '0'")) {
    failures.push("resolveInvoiceDisplayId MAX allocator does not exclude '0' prefix rows — blank non-$0 next counter would include $0 invoices");
  }

  // Rule 6: from-load.ts passes opts: { loadNumber, authorizedZeroRevenue } (not autoFallback=loadNumber)
  if (!fromLoadSrc.includes("{ loadNumber, authorizedZeroRevenue: input.authorizedZeroRevenue }")) {
    failures.push("from-load.ts does not pass opts: { loadNumber, authorizedZeroRevenue } to resolveInvoiceDisplayId — from-load invoices will use old load_number-only display_id");
  }
  // Ensure old autoFallback=loadNumber pattern is gone from from-load.ts
  if (/resolveInvoiceDisplayId[\s\S]{0,300}loadNumber\s*\n\s*\)/.test(fromLoadSrc)) {
    failures.push("from-load.ts still appears to pass loadNumber as the autoFallback (5th positional arg) — should be opts.loadNumber instead");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`18365-verify-invoice-number-is-invoice-dash-load SELFTEST FAIL — good sources rejected:\n  ${baseline.join("\n  ")}`);
    process.exit(1);
  }
  const displayIdSrc = loadFile(DISPLAY_ID_PATH);
  const fromLoadSrc = loadFile(FROM_LOAD_PATH);
  const mutations = [
    [
      "invoice-dash-load alternative removed from INVOICE_DISPLAY_ID_PATTERN",
      displayIdSrc,
      displayIdSrc.replace("|[0-9]{1,6}-[0-9]{1,12}", ""),
      fromLoadSrc,
    ],
    [
      "opts.loadNumber branch removed from resolveInvoiceDisplayId",
      displayIdSrc,
      displayIdSrc.replace("opts?.loadNumber", "opts?.__REMOVED__"),
      fromLoadSrc,
    ],
    [
      "typed-digits composition removed",
      displayIdSrc,
      displayIdSrc.replace("`${typedDigits}-${loadNum}`", "`${typedDigits}`"),
      fromLoadSrc,
    ],
    [
      "$0 path removed from resolveInvoiceDisplayId",
      displayIdSrc,
      displayIdSrc.replace("`0-${loadNum}`", "`0`"),
      fromLoadSrc,
    ],
    [
      "from-load.ts opts not passed",
      displayIdSrc,
      displayIdSrc,
      fromLoadSrc.replace("{ loadNumber, authorizedZeroRevenue: input.authorizedZeroRevenue }", "{}"),
    ],
  ];
  const escaped = [];
  for (const [name, ds, dsMutated, fls] of mutations) {
    const fs = fls ?? fromLoadSrc;
    const result = collectFailures(dsMutated, fs);
    if (result.length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`18365-verify-invoice-number-is-invoice-dash-load SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`18365-verify-invoice-number-is-invoice-dash-load SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
  process.exit(0);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("18365-verify-invoice-number-is-invoice-dash-load: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("18365-verify-invoice-number-is-invoice-dash-load: OK — every from-load invoice is numbered <N>-<load>; typed, $0, and auto-allocated paths verified");
