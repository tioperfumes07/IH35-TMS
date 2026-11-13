#!/usr/bin/env node
/**
 * verify-settlement-payrun-close-stamps-accounting-bill-id.mjs
 * CC-1 Row 82/86 — SETL-HEADER-05-PAYRUN: settlement-payrun-close must stamp
 * driver_settlements.accounting_bill_id = COALESCE(accounting_bill_id, <first bill id>)
 * in the same UPDATE that stamps posted_at. Without this, every settlement closed via
 * the payrun path gets accounting_bill_id=NULL, breaking the header backlink.
 *
 * Static guard only — checks the source file for the required COALESCE pattern.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const SELFTEST = process.argv.includes("--selftest");

const SERVICE_PATH = resolve("apps/backend/src/driver-finance/settlement-payrun-close.service.ts");

function check(label, pass, detail = "") {
  if (!pass) {
    console.error(`FAIL [${label}]${detail ? ": " + detail : ""}`);
    process.exit(1);
  }
  console.log(`PASS [${label}]`);
}

if (SELFTEST) {
  // ── Selftest: plant failures on a mutated source string ──────────────────
  const src = readFileSync(SERVICE_PATH, "utf8");

  // Plant 1: missing COALESCE for accounting_bill_id column
  const noCoalesce = src.replace(
    /accounting_bill_id = COALESCE\(accounting_bill_id, \$5::uuid\)/,
    "-- removed"
  );
  check("selftest:missing-coalesce:has-pattern", !noCoalesce.includes("accounting_bill_id = COALESCE(accounting_bill_id, $5::uuid)"));

  // Plant 2: missing chain.bills[0] parameter
  const noParam = src.replace(/chain\.bills\[0\]\?\.accounting_bill_id \?\? null/, "null");
  check("selftest:missing-param:has-chain", !noParam.includes("chain.bills[0]?.accounting_bill_id ?? null"));

  // Plant 3: COALESCE must be in same UPDATE as posted_at — removing it makes no block satisfy both
  const separated = src.replace("accounting_bill_id = COALESCE(accounting_bill_id, $5::uuid)", "");
  const sepBlocks = [...separated.matchAll(/UPDATE driver_finance\.driver_settlements[\s\S]*?WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/g)].map((m) => m[0]);
  const sepSharedBlock = sepBlocks.find((b) => b.includes("posted_at = COALESCE") && b.includes("accounting_bill_id = COALESCE"));
  check("selftest:same-update:no-shared-block-after-removal", !sepSharedBlock);

  console.log("selftest: 3/3 PASS");
  process.exit(0);
}

const src = readFileSync(SERVICE_PATH, "utf8");

// Rule 1: settlement-payrun-close stamps accounting_bill_id via COALESCE
check(
  "payrun-close:stamps-accounting-bill-id-coalesce",
  src.includes("accounting_bill_id = COALESCE(accounting_bill_id, $5::uuid)"),
  "settlement-payrun-close.service.ts must stamp accounting_bill_id = COALESCE(accounting_bill_id, $5::uuid) on the settlement header UPDATE"
);

// Rule 2: the parameter uses chain.bills[0]?.accounting_bill_id
check(
  "payrun-close:chain-bills-first-id-as-param",
  src.includes("chain.bills[0]?.accounting_bill_id ?? null"),
  "settlement-payrun-close.service.ts must pass chain.bills[0]?.accounting_bill_id ?? null as parameter to the header UPDATE"
);

// Rule 3: the COALESCE is in the same UPDATE as posted_at (not a separate round-trip)
const allUpdateBlocks = [...src.matchAll(/UPDATE driver_finance\.driver_settlements[\s\S]*?WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/g)].map((m) => m[0]);
const sharedBlock = allUpdateBlocks.find((b) => b.includes("posted_at = COALESCE") && b.includes("accounting_bill_id = COALESCE"));
check(
  "payrun-close:accounting-bill-id-in-same-update-as-posted-at",
  !!sharedBlock,
  "accounting_bill_id COALESCE must be in the SAME UPDATE statement as posted_at (not a separate query)"
);

console.log("verify-settlement-payrun-close-stamps-accounting-bill-id: PASS");
