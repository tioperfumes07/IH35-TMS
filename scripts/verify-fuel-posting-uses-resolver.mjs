#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const posterPath = path.join(repoRoot, "apps/backend/src/accounting/fuel-posting/poster.service.ts");

function fail(messages) {
  console.error("verify:fuel-posting-uses-resolver — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
if (!fs.existsSync(posterPath)) {
  failures.push("missing apps/backend/src/accounting/fuel-posting/poster.service.ts");
} else {
  const source = fs.readFileSync(posterPath, "utf8");
  // CC-2 2026-10-04 — ONE account rule for fuel: fuel type -> catalog item -> the item's account (fuel-item-account.ts),
  // the same rule the expense document uses. This guard used to REQUIRE the per-category map
  // (accounting.expense_category_account_map), a second source: its DEF row drifted back to 5000 on 2026-09-23 and its
  // reefer row was always 5000, so poster-posted DEF / reefer landed in Fuel & Diesel while their documents said
  // 5010 / 5015 (6 DEF purchases, $170.63, live 2026-10-04).
  if (!/from "\.\/fuel-item-account\.js"/.test(source) || !/resolveFuelItem\(\s*client[^,]*,\s*input\.operating_company_id,\s*POSTING_KIND_FUEL_TYPE\[fuelKind\]/.test(source)) {
    failures.push("fuel posting must resolve its cost account via resolveFuelItem(client, oc, POSTING_KIND_FUEL_TYPE[fuelKind]) from ./fuel-item-account.js");
  }
  if (/resolveAccountForCategory|expense-category-map\/resolver/.test(source)) {
    failures.push("fuel posting must never resolve its cost account from expense_category_account_map (a second source that drifted)");
  }
  const docPath = path.join(repoRoot, "apps/backend/src/fuel/fuel-expense-document.service.ts");
  const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf8") : "";
  if (!/from "\.\.\/accounting\/fuel-posting\/fuel-item-account\.js"/.test(doc) || /const FUEL_TYPE_ITEM_NAME\b/.test(doc)) {
    failures.push("fuel-expense-document must use the shared fuel-item-account rule, not a private copy of the fuel-type item map");
  }
  if (/INSERT INTO accounting\.expense_category_account_map/i.test(source)) {
    failures.push("poster.service must not write directly to expense_category_account_map");
  }
  if (!/source_transaction_type,\s*source_transaction_id/.test(source) || !/'fuel_event'/.test(source)) {
    failures.push("fuel posting must stamp source_transaction_type='fuel_event' for posting traceability");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:fuel-posting-uses-resolver — OK");
