#!/usr/bin/env node
/**
 * Register rows 97 / 157 / 163 / 3 — one guard.
 *  97  vendor "Suggested category" (top account of live expenses + share) with a one-click, user-driven save through the
 *      existing vendor PATCH route; the read never writes.
 *  157 duplicate customers = identical normalized name, or similar name + same MC/DOT/address (a name-only lead is not
 *      flagged); Billed on the Customers board = issued invoices only (draft/proforma shown apart, never merged records).
 *  163 Fuel savings / compliance name WHY they are empty (Loves price sync state), not a bare "Not available".
 *  3   header photo from a linked IMAGE (CDL / ID / unit photo), shown whole: no crop, no PDF thumbnail, no medical card.
 * Run: node scripts/verify-rows-97-157-163-3.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  sugg: "apps/backend/src/mdata/canonical/vendor-suggested-category.ts",
  board: "apps/backend/src/mdata/canonical/party-board.service.ts",
  profile: "apps/backend/src/mdata/canonical/vendor-profile.service.ts",
  vendors: "apps/backend/src/mdata/vendors.routes.ts",
  suggFe: "apps/frontend/src/components/vendors/SuggestedCategory.tsx",
  variant: "apps/backend/src/mdata/canonical/variant-candidates.ts",
  variantSvc: "apps/backend/src/mdata/canonical/variant-candidates.service.ts",
  planner: "apps/backend/src/fuel/planner.routes.ts",
  gap: "apps/backend/src/fuel/fuel-source-state.ts",
  savings: "apps/frontend/src/pages/fuel/components/SavingsPanel.tsx",
  compliance: "apps/frontend/src/pages/fuel/components/CompliancePanel.tsx",
  pick: "apps/backend/src/mdata/uploaded-photo-pick.ts",
  driverAgg: "apps/backend/src/mdata/driver-aggregate.service.ts",
  unitPhotos: "apps/backend/src/mdata/unit-photos.routes.ts",
  unitFe: "apps/frontend/src/components/units/UnitHeaderPhoto.tsx",
  idHeader: "apps/frontend/src/components/driver-profile/IdentityHeader.tsx",
};

/** [name, file key, test(text) => boolean] — every check must hold on the live tree. */
const checks = [
  ["97 suggestion counts live expenses", "sugg", (t) => /\$\{liveExpense\("e"\)\}/.test(t)],
  ["97 suggestion limited to operating-cost accounts", "sugg", (t) => /account_type IN \('Expense', 'CostOfGoodsSold'\)/.test(t)],
  ["97 suggestion read never writes", "sugg", (t) => /export async function readVendorSuggestedCategories/.test(t) && !/\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b/.test(t)],
  ["97 board rows carry suggested_category", "board", (t) => /suggested_category: suggestions\.get/.test(t)],
  ["97 profile carries suggested_category", "profile", (t) => /suggested_category: \(await readVendorSuggestedCategories/.test(t)],
  ["97 vendor PATCH accepts operating-cost accounts", "vendors", (t) => /accountType === "Expense" \|\| accountType === "CostOfGoodsSold"/.test(t)],
  ["97 set goes through the vendor update route", "suggFe", (t) => /updateVendor\(props\.vendorId, \{ default_expense_account_id: accountId \}\)/.test(t)],
  ["97 set is a click, never automatic", "suggFe", (t) => /onClick=\{\(e\) => \{ e\.stopPropagation\(\); save\.mutate/.test(t) && !/useEffect/.test(t)],
  ["157 exact tier = same normalized name", "variant", (t) => /m\.reasons\.includes\("same_squashed_name"\) \? "exact"/.test(t)],
  ["157 customer fuzzy pair needs MC/DOT/address", "variant", (t) => /if \(p\.tier !== "name_only"\) return true;\s*return p\.a\.kind !== "customer" && p\.b\.kind !== "customer";/.test(t)],
  ["157 service counts only flagged pairs", "variantSvc", (t) => /all\.filter\(isFlaggedDuplicate\)/.test(t)],
  ["157 service reads MC / DOT / address", "variantSvc", (t) => /c\.mc_number AS mc/.test(t) && /c\.billing_address_line1/.test(t)],
  ["157 billed = issued invoices only", "board", (t) => /sum\(total_cents\) FILTER \(WHERE \$\{issuedInvoice\("i"\)\}\) AS billed/.test(t)],
  ["157 proforma shown apart", "board", (t) => /proforma_cents: sum\("proforma_cents"\)/.test(t)],
  ["163 savings summary names the gap", "planner", (t) => (t.match(/gap: await readFuelSourceGap\(client, companyId, (true|false)\)/g) ?? []).length === 4],
  ["163 gap reads the Loves price table", "gap", (t) => /FROM fuel\.loves_prices_daily WHERE operating_company_id/.test(t) && /LOVES_CARD_CSV_URL/.test(t)],
  ["163 savings panel says why", "savings", (t) => /data-testid="fuel-source-gap"/.test(t) && /Not synced since/.test(t)],
  ["163 compliance panel says why", "compliance", (t) => /data-testid="fuel-source-gap"/.test(t) && /Not synced since/.test(t)],
  ["3 only images are photos", "pick", (t) => /\^image\\\/\(jpe\?g\|png\|webp\|gif\)\$/.test(t)],
  ["3 medical card is never a portrait", "pick", (t) => /f\.category_code !== "medical_card"/.test(t)],
  ["3 driver header falls back to the uploaded ID image", "driverAgg", (t) => /pickDriverIdPhoto\(await loadLinkedImageFiles\(client, "driver"/.test(t)],
  ["3 unit photos route offers a linked image", "unitPhotos", (t) => /pickUnitPhoto\(await loadLinkedImageFiles\(client, "unit"/.test(t)],
  ["3 unit header shows it whole", "unitFe", (t) => /object-contain/.test(t) && !/object-cover/.test(t)],
  ["3 driver header shows the ID whole", "idHeader", (t) => /driver-photo-from-upload/.test(t) && /object-contain/.test(t)],
];

const read = (rel) => readFileSync(join(root, rel), "utf8");
const load = () => Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const failures = (src) => checks.filter(([, key, test]) => !test(src[key])).map(([name]) => name);

const src = load();
const base = failures(src);
if (base.length) {
  console.error(`verify-rows-97-157-163-3: FAIL\n  ${base.join("\n  ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  // Break each file in turn (blank it) and demand that every check on that file notices.
  let caught = 0;
  const escaped = [];
  for (const [name, key] of checks) {
    const mutated = { ...src, [key]: "/* planted regression */" };
    if (failures(mutated).includes(name)) caught += 1;
    else escaped.push(name);
  }
  if (caught !== checks.length) {
    console.error(`verify-rows-97-157-163-3 selftest FAIL: caught ${caught}/${checks.length}; escaped=${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-rows-97-157-163-3 selftest PASS: ${caught}/${checks.length} planted regressions caught`);
  process.exit(0);
}
console.log(`verify-rows-97-157-163-3: PASS (${checks.length} checks: vendor suggestion, duplicate rule, one billed figure, fuel gap states, header photos)`);
