#!/usr/bin/env node
/**
 * AP-BILL-NUMBER-IS-THE-LOAD-NUMBER — the AP screen's "Bill #" column is a DIFFERENT identity series
 * from a load number. settlement-bill-payment-posting.service.ts's driver-pay bill previously passed
 * the bare load number (or load id) straight through as `billNumber`, so a USMCA driver-pay bill's
 * "Bill #" read as the load number itself (e.g. "L-20260810-0003") — indistinguishable from citing the
 * load, not an AP document.
 *
 * INVARIANT (static — no database): the settlement-bill-payment-posting service's `createBill(...)`
 * call must NOT pass a bare `b.load_number`/`b.load_id` as `billNumber` — it must be prefixed (or
 * otherwise transformed) so a TMS-native bill_number can never collide with the load-number shape
 * (`L-YYYYMMDD-NNNN`) verbatim.
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

  // The bare/unprefixed shapes this guard exists to catch — a raw String(...) cast or direct reference
  // to load_number/load_id with no transform.
  const isBareStringCast = /^String\(\s*b\.load_number\s*\?\?\s*b\.load_id\s*\)$/.test(expr);
  const isBareReference = /^b\.load_number$|^b\.load_id$/.test(expr);
  if (isBareStringCast || isBareReference) {
    return {
      ok: false,
      reason: `billNumber is assigned the bare load number/id with no prefix or transform (${expr}) — a driver-pay bill's "Bill #" would read as the load number itself`,
    };
  }
  return { ok: true, expr };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    const bill = await createBill(
      {
        operatingCompanyId: opco,
        vendorId: driverVendorId,
        billNumber: \`B-\${b.load_number ?? b.load_id}\`,
        billDate,
      }
    );
  `;
  const goodResult = checkBillNumberNotLoadNumber(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
    const bill = await createBill(
      {
        operatingCompanyId: opco,
        vendorId: driverVendorId,
        billNumber: String(b.load_number ?? b.load_id),
        billDate,
      }
    );
  `;
  const regressedResult = checkBillNumberNotLoadNumber(regressed);
  if (regressedResult.ok) fail("selftest: regressed fixture (bare String(load_number ?? load_id)) should FAIL but passed");

  const commentTrap = `
    // billNumber: \`B-\${b.load_number ?? b.load_id}\` — do not regress to the bare form
    const bill = await createBill(
      {
        operatingCompanyId: opco,
        vendorId: driverVendorId,
        billNumber: String(b.load_number ?? b.load_id),
        billDate,
      }
    );
  `;
  const commentTrapResult = checkBillNumberNotLoadNumber(commentTrap);
  if (commentTrapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkBillNumberNotLoadNumber(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — billNumber is prefixed/transformed, not the bare load number/id (${result.expr})`);
}
