#!/usr/bin/env node
/**
 * Guard B — verify insurance creator contracts:
 *  1. "+ Create policy" wording exists; "New policy" / "Add policy" do not.
 *  2. cost_per_vehicle / cost_per_month field referenced in creator code.
 *  3. allocation methods equal_split (default), pro_rata, weighted present.
 *  4. Atomic route endpoint referenced (/with-bills).
 *  5. idempotency_key present in atomic service.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const WIZARD_PATH = resolve(ROOT, "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx");
const HOOK_PATH = resolve(ROOT, "apps/frontend/src/components/insurance/useCostPerVehicle.ts");
const SERVICE_PATH = resolve(ROOT, "apps/backend/src/insurance/policy-create-atomic.service.ts");
const ROUTE_PATH = resolve(ROOT, "apps/backend/src/insurance/policy-create-atomic.routes.ts");
const API_PATH = resolve(ROOT, "apps/frontend/src/api/insurance.ts");

const failures = [];

function checkFile(label, path, checks) {
  if (!existsSync(path)) {
    failures.push(`${label}: file not found at ${path}`);
    return;
  }
  const src = readFileSync(path, "utf8");
  for (const [desc, pattern] of checks) {
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    if (!re.test(src)) {
      failures.push(`${label}: missing ${desc} (pattern: ${pattern})`);
    }
  }
}

checkFile("PolicyCreateWizard", WIZARD_PATH, [
  ["'+ Create policy' wording", /\+\s*Create policy/],
  ["cost_per_vehicle_display / costPerVehicleDisplay", /costPerVehicleDisplay/],
  ["equal_split allocation", /equal_split/],
  ["pro_rata allocation", /pro_rata/],
  ["weighted allocation", /weighted/],
  ["equal_split as default", /equal_split.*default|default.*equal_split|allocation_method.*equal_split/],
  ["term_months used", /term_months|termMonths/],
  ["unit_ids used", /unit_ids|unitIds/],
  ["0-unit guard (disabled when 0)", /selectedUnitIds\.length\s*===\s*0/],
]);

checkFile("useCostPerVehicle hook", HOOK_PATH, [
  ["cost_per_vehicle_per_month logic", /costPerVehiclePerMonth/],
  ["equal_split branch", /equal_split/],
  ["costPerVehicleDisplay export", /costPerVehicleDisplay/],
]);

checkFile("Atomic service", SERVICE_PATH, [
  ["idempotency_key per bill", /idempotencyKey|idempotency_key/],
  ["equal_split method", /equal_split/],
  ["pro_rata method", /pro_rata/],
  ["weighted method", /weighted/],
  ["N bills = term_months", /termMonths|term_months/],
  ["withCurrentUser (single tx)", /withCurrentUser/],
]);

checkFile("Atomic route", ROUTE_PATH, [
  ["with-bills endpoint", /\/with-bills/],
  ["term_months param", /term_months/],
  ["allocation_method param", /allocation_method/],
  ["unit_ids param", /unit_ids/],
]);

checkFile("Frontend API", API_PATH, [
  ["createPolicyWithBills export", /createPolicyWithBills/],
  ["AllocationMethod type", /AllocationMethod/],
  ["equal_split type value", /equal_split/],
]);

// Vocabulary guard: no "+ New policy" or "+ Add policy" in creator
const VOCAB_FILES = [WIZARD_PATH, API_PATH];
for (const p of VOCAB_FILES) {
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  if (/\+\s*New\s+[Pp]olicy|\+\s*Add\s+[Pp]olicy/.test(src)) {
    failures.push(`Vocabulary violation: found '+ New policy' or '+ Add policy' in ${p}`);
  }
}

if (failures.length > 0) {
  console.error("❌ insurance-creator contract FAILED:");
  for (const f of failures) console.error("   " + f);
  process.exit(1);
}

console.log("✅ insurance-creator contract passed");
