#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

export function run() {
  const errors = [];
  const page = read("apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
  const detail = read("apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx");
  const header = read("apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx");
  const vendor = read("apps/frontend/src/components/vendors/VendorCreateModal.tsx");

  assert(
    page.includes("const kpiBaseQuery = useQuery") && page.includes("listSettlements(companyId)"),
    "SettlementsPage must query an unfiltered list for KPI base",
    errors
  );
  assert(
    page.includes("const kpiSettlements") && page.includes("kpiSettlements.filter"),
    "SettlementsPage KPIs must use kpiSettlements (not the table slice)",
    errors
  );
  assert(
    page.includes('dataTestId="settlements-filter-driver"') &&
      page.includes('kind="driver"') &&
      page.includes("allowCreate={false}") &&
      page.includes('searchParams.get("driver_id")'),
    "SettlementsPage must render EntityPicker kind=driver filter (allowCreate=false) and honor ?driver_id=",
    errors
  );

  assert(
    detail.includes("const settlementDisplayId =") && detail.includes("`Settlement ${settlementDisplayId}`"),
    "SettlementDetailPage must derive and render settlement display_id in the title",
    errors
  );
  assert(
    detail.includes("showManualPaidDraftBanner") && detail.includes("manual_paid"),
    "SettlementDetailPage must show an honest manual_paid / not finalized banner",
    errors
  );
  assert(
    detail.includes("showFinalizeBlock") && detail.includes("{showFinalizeBlock ? ("),
    "SettlementDetailPage must conditionally render the Finalize block",
    errors
  );

  assert(
    header.includes("settlementDisplayId?: string | null") &&
      (header.includes("{settlementDisplayId}") || header.includes("settlementDisplayId,") || /label=\{entityLabel\(settlementDisplayId/.test(header)),
    "SettlementHeader must accept and render settlementDisplayId",
    errors
  );

  assert(
    vendor.includes("vendor_type_name ?? row.vendor_type_code ?? row.code ?? \"\""),
    "VendorCreateModal must fallback through vendor_type_name / vendor_type_code / code when display_name is empty",
    errors
  );

  return errors;
}

function selftest() {
  const pagePath = path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
  const backup = fs.readFileSync(pagePath, "utf8");
  try {
    const patched = backup.replace(/const kpiBaseQuery = useQuery\(\{[\s\S]*?\n  \}\);\n/, "");
    fs.writeFileSync(pagePath, patched, "utf8");
    const planted = run();
    if (!planted.some((e) => e.includes("unfiltered list for KPI base"))) {
      throw new Error("planted kpiBaseQuery removal not detected");
    }
    console.log(`[verify-settlement-fe-honesty] SELFTEST PASS (${planted.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(pagePath, backup, "utf8");
  }
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error("\n[verify-settlement-fe-honesty] FAILED:\n");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("[verify-settlement-fe-honesty] All checks passed ✓");
}

main();
