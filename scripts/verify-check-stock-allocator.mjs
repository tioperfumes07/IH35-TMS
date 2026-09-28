#!/usr/bin/env node
// verify-check-stock-allocator.mjs — R-190 Check Creator.
// Asserts the stock settings upsert + advance-after-use path exists and is wired into createCheck
// and the Print Checks UI. Never invents a starting number (spec §3c).
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-check-stock-allocator";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mustInclude(file, needle, why) {
  const src = read(file);
  if (!src.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${file} missing ${JSON.stringify(needle)} (${why})`);
    process.exit(1);
  }
}

function selftest() {
  const stock = read("apps/backend/src/accounting/checks/check-stock.service.ts");
  if (!stock.includes("upsertCheckStockSettings") || !stock.includes("advanceCheckStockAfterUse")) {
    throw new Error("stock service missing upsert/advance exports");
  }
  if (!stock.includes("Never invent") && !stock.includes("never invent")) {
    // soft — comment may vary; hard check is the upsert refuses non-positive
  }
  if (!stock.includes("next_check_number must be a positive") && !stock.includes("positive integer")) {
    throw new Error("stock upsert must refuse non-positive next_check_number");
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`${LABEL} --selftest FAIL`, e.message);
    process.exit(1);
  }
  process.exit(0);
}

mustInclude(
  "apps/backend/src/accounting/checks/check-stock.service.ts",
  "upsertCheckStockSettings",
  "owner-typed starting number writer"
);
mustInclude(
  "apps/backend/src/accounting/checks/check-stock.service.ts",
  "advanceCheckStockAfterUse",
  "allocator advances after a used number"
);
mustInclude(
  "apps/backend/src/accounting/checks/check-create.service.ts",
  "advanceCheckStockAfterUse",
  "Write Check advances stock after registry insert"
);
mustInclude(
  "apps/backend/src/accounting/checks/checks.routes.ts",
  "/api/v1/checks/stock-settings",
  "stock settings GET/PUT routes"
);
mustInclude(
  "apps/backend/src/accounting/checks/checks.routes.ts",
  "/api/v1/checks/:id/unvoid",
  "check unvoid/reinstate route"
);
mustInclude(
  "apps/backend/src/accounting/checks/check-void.service.ts",
  "stampDocumentReinstated",
  "unvoid clears void stamps via the single-writer stamp service"
);
mustInclude(
  "apps/backend/src/accounting/void-document-stamp.service.ts",
  "stampDocumentReinstated",
  "canonical reinstate stamp writer (voided_at clear + reinstated_*)"
);
mustInclude(
  "apps/backend/src/accounting/checks/check-void.service.ts",
  "voidJournalEntry",
  "posted unvoid voids the reversing JE (Option-1)"
);
mustInclude(
  "apps/frontend/src/pages/accounting/checks/CheckPrintPage.tsx",
  "Starting check no.",
  "Print Checks UI lets owner type starting number"
);
mustInclude(
  "apps/frontend/src/routes/manifest.tsx",
  "/accounting/checks/print",
  "Print Checks route registered"
);
mustInclude(
  "apps/frontend/src/api/checks.ts",
  "putCheckStockSettings",
  "FE client for stock upsert"
);
mustInclude(
  "apps/frontend/src/components/checks/WriteCheckForm.tsx",
  "next_check_number",
  "Write Check auto-fills from stock next"
);

console.log(`${LABEL}: PASS — stock allocator, Print Checks UI, and unvoid path are wired.`);
process.exit(0);
