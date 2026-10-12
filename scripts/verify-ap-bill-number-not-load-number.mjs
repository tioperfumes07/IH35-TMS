#!/usr/bin/env node
/**
 * AP-BILL-NUMBER-IS-THE-LOAD-NUMBER — RESTATED 443.99 to the law as it stands today.
 *
 * HISTORY: ACCT-F364 (f3431646a3, 2026-08-12) required the driver-pay bill's "Bill #" to be prefixed so it never read
 * as the load number. The owner REVERSED that: GO-19 slice 03 (18c159c20a, #20106, 2026-09-03), GO-27 Gate 0.3
 * (driver-finance/driver-bill-number.ts) and OWNER RULING 2026-10-02 "DRIVER BILLS ARE PER LOAD" — "BILLS ARE NUMBERED
 * EXACTLY AS LOADS ... Not derived, not prefixed, not sequenced." The guard kept enforcing the overturned rule, so it
 * failed on the correct code. It is not deleted: it now locks the owner's rule at this call site.
 *
 * INVARIANT (static — no database): the settlement-bill-payment-posting service's `createBill(...)` call passes the
 * load number itself as `billNumber` — `String(b.load_number ?? b.load_id)` or driverBillNumberFromLoadNumber(...) —
 * never a prefixed / suffixed / templated form (B-<load>, `${...}`-built strings, concatenation).
 *
 * Self-test: node scripts/verify-ap-bill-number-not-load-number.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-ap-bill-number-not-load-number";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function checkBillNumberNotLoadNumber(src) {
  const code = stripComments(src);
  const match = /billNumber:\s*([^,\n]+),/.exec(code);
  if (!match) return { ok: false, reason: "billNumber: ... assignment not found in createBill(...) call" };
  const expr = match[1].trim();

  // OWNER RULING 2026-10-02: the bill number IS the load number — exactly these shapes, nothing derived.
  const isLoadNumber =
    /^String\(\s*b\.load_number\s*\?\?\s*b\.load_id\s*\)$/.test(expr) ||
    /^b\.load_number$/.test(expr) ||
    /^driverBillNumberFromLoadNumber\(\s*String\(\s*b\.load_number\s*\?\?\s*b\.load_id\s*\)\s*\)$/.test(expr);
  if (!isLoadNumber) {
    return {
      ok: false,
      reason: `billNumber is not the load number itself (${expr}) — OWNER RULING 2026-10-02: driver bills are numbered EXACTLY as their loads (no prefix, no derivation)`,
    };
  }
  return { ok: true, expr };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const wrap = (expr) => `
    const bill = await createBill(
      {
        operatingCompanyId: opco,
        vendorId: driverVendorId,
        billNumber: ${expr},
        billDate,
      }
    );
  `;
  const good = checkBillNumberNotLoadNumber(wrap("String(b.load_number ?? b.load_id)"));
  if (!good.ok) fail(`selftest: the load number itself should pass — ${good.reason}`);
  const viaHelper = checkBillNumberNotLoadNumber(wrap("driverBillNumberFromLoadNumber(String(b.load_number ?? b.load_id))"));
  if (!viaHelper.ok) fail(`selftest: driverBillNumberFromLoadNumber(load number) should pass — ${viaHelper.reason}`);

  for (const bad of ["`B-${b.load_number ?? b.load_id}`", "\"B-\" + b.load_number", "`${b.load_number}-1`", "nextBillNumber()"]) {
    if (checkBillNumberNotLoadNumber(wrap(bad)).ok) fail(`selftest: a derived bill number (${bad}) should FAIL but passed`);
  }

  const commentTrap = `
    // billNumber: String(b.load_number ?? b.load_id), — the owner's rule, mentioned only in prose
    const bill = await createBill(
      {
        operatingCompanyId: opco,
        vendorId: driverVendorId,
        billNumber: \`B-\${b.load_number ?? b.load_id}\`,
        billDate,
      }
    );
  `;
  if (checkBillNumberNotLoadNumber(commentTrap).ok) fail("selftest: comment-trap fixture (rule mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — load number / helper pass; B- prefix, concat, suffix, sequence and comment-trap fail`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkBillNumberNotLoadNumber(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — the driver-pay bill number is the load number itself (${result.expr}), per OWNER RULING 2026-10-02`);
}
