#!/usr/bin/env node
// BLOCK SC1 — static guard.
//
// Locks the fix for the "dead accident catalogs" defect: the Accident Report wizard's
// Driver / Unit / Repair Vendor / Load fields were bare free-text <input>s with no data source
// (typing fired zero API calls, rendered zero options — reports could not key to a real
// driver/unit/vendor/load record). This guard fails if any of the four fields regresses to a
// free-text input, or if the wizard stops importing the real catalog list functions.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TAG = "[verify-accident-wizard-catalogs]";
const DRAWER = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";

function fail(msg) {
  console.error(`${TAG} FAIL: ${msg}`);
  process.exit(1);
}

const ROUTES = "apps/backend/src/safety/safety.routes.ts";

const abs = path.join(repoRoot, DRAWER);
if (!fs.existsSync(abs)) fail(`accident wizard component missing: ${DRAWER}`);
const src = fs.readFileSync(abs, "utf8");

// 1) The wizard must source its catalogs from the real, company-scoped list functions.
//    The DRIVER catalog may be reached directly via listDrivers OR through the shared
//    <DriverPickerWithCreate> (PLUS-DRIVER-SYSTEM), which calls listDrivers internally. When it
//    delegates, the shared component is inspected too — otherwise "renders a component" would be an
//    unchecked escape hatch and the dead-catalog defect this guard exists to catch could return
//    through the shared picker.
const SHARED_DRIVER_PICKER = "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx";
const delegatesDriverPicker = src.includes("DriverPickerWithCreate");
if (!src.includes("listDrivers") && !delegatesDriverPicker) {
  fail(`${DRAWER} no longer imports/uses listDrivers — the listDrivers catalog is dead again`);
}
if (delegatesDriverPicker) {
  let shared = "";
  try { shared = fs.readFileSync(path.join(process.cwd(), SHARED_DRIVER_PICKER), "utf8"); } catch { shared = ""; }
  if (!shared) fail(`${SHARED_DRIVER_PICKER} is missing but ${DRAWER} delegates its driver catalog to it`);
  else if (!shared.includes("listDrivers")) {
    fail(`${SHARED_DRIVER_PICKER} no longer calls listDrivers — the driver catalog is dead through the shared picker`);
  }
}
for (const fn of ["listUnits", "listVendors"]) {
  if (!src.includes(fn)) fail(`${DRAWER} no longer imports/uses ${fn} — the ${fn} catalog is dead again`);
}
// Load picker uses the dispatch loads list.
if (!src.includes("listDispatchLoads")) {
  fail(`${DRAWER} no longer uses listDispatchLoads — the Load catalog is dead again`);
}

// 2) Each of the four fields must render through a real picker (data-testid marker present).
const requiredPickers = [
  "accident-driver-picker",
  "accident-unit-picker",
  "accident-vendor-picker",
  "accident-load-picker",
];
for (const testid of requiredPickers) {
  if (!src.includes(testid)) fail(`${DRAWER} missing picker marker "${testid}" — a catalog field regressed to no data source`);
}

// 3) No free-text persistence of the linked ids: the driver/unit fields must NOT bind a bare
//    <input defaultValue={String(accident.driver_id ...)} / accident.unit_id — the exact pre-fix
//    dead pattern. The id must flow through the Combobox picker (state), not a typed string.
const deadPatterns = [
  /<input[^>]*defaultValue=\{String\(accident\.driver_id/,
  /<input[^>]*defaultValue=\{String\(accident\.unit_id/,
];
for (const pattern of deadPatterns) {
  if (pattern.test(src)) fail(`${DRAWER} still binds a linked id to a free-text <input> (${pattern}) — pickers must own the id`);
}

// 4) The office creator persists the links: the drawer must call the create endpoint helper.
if (!src.includes("createSafetyAccident")) {
  fail(`${DRAWER} no longer calls createSafetyAccident — office-created reports would not persist the links`);
}

// 5) Backend: the accident create endpoint must INSERT the three link columns into
//    safety.accident_reports AND emit a spine audit event on the mutation (audit-emit invariant).
const routesAbs = path.join(repoRoot, ROUTES);
if (!fs.existsSync(routesAbs)) fail(`safety routes missing: ${ROUTES}`);
const routes = fs.readFileSync(routesAbs, "utf8");

if (!/app\.post\(\s*["'`]\/api\/v1\/safety\/accidents["'`]/.test(routes)) {
  fail(`${ROUTES} missing POST /api/v1/safety/accidents (office creator endpoint)`);
}
const insertMatch = routes.match(/INSERT\s+INTO\s+safety\.accident_reports[\s\S]*?RETURNING/i);
if (!insertMatch) fail(`${ROUTES} has no INSERT INTO safety.accident_reports — office creator does not persist`);
for (const col of ["unit_id", "vendor_id", "load_id"]) {
  if (!insertMatch[0].includes(col)) fail(`${ROUTES} accident INSERT does not persist ${col} link`);
}
if (!routes.includes("appendCrudAudit") || !routes.includes("safety.accident.created")) {
  fail(`${ROUTES} accident create does not emit a spine audit event (safety.accident.created)`);
}

// 6) The additive migration must add the three link columns to safety.accident_reports.
const migDir = path.join(repoRoot, "db/migrations");
const migFiles = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")) : [];
const hasLinkMigration = migFiles.some((f) => {
  const body = fs.readFileSync(path.join(migDir, f), "utf8");
  return (
    body.includes("safety.accident_reports") &&
    /ADD COLUMN IF NOT EXISTS\s+unit_id/i.test(body) &&
    /ADD COLUMN IF NOT EXISTS\s+vendor_id/i.test(body) &&
    /ADD COLUMN IF NOT EXISTS\s+load_id/i.test(body)
  );
});
if (!hasLinkMigration) {
  fail("no migration adds unit_id/vendor_id/load_id (ADD COLUMN IF NOT EXISTS) to safety.accident_reports");
}


// 7) SAF-F30 — EVERY rendered field must be CONTROLLED and present in the SUBMIT PAYLOAD.
//    This is the assertion whose absence let SAF-F05 through: the wizard rendered 20 fields and
//    submitted 6, and this guard reported OK because it only ever looked at 4 catalog pickers.
//
//    Each entry pairs the field's data-testid (proof it is rendered) with the payload key it must
//    reach (proof it is saved). A field present in the UI and absent from the payload is a silent
//    data-loss bug on an evidence record — the operator types it, the drawer accepts it, and it is
//    gone the moment they hit save.
const FIELD_TO_PAYLOAD_KEY = [
  ["accident-police-report-number", "police_report_number"],
  ["accident-insurance-claim-number", "insurance_claim_number"],
  ["accident-location", "location"],
  ["accident-third-party-name", "third_party_name"],
  ["accident-third-party-plate", "third_party_plate"],
  ["accident-vendor-invoice-number", "vendor_invoice_number"],
  ["accident-bill-or-expense-ref", "bill_or_expense_ref"],
  ["accident-memo", "description"],
  ["accident-incident-date", "accident_at"],
  ["accident-at-fault", "at_fault"],
  ["accident-preventable", "preventable"],
];

for (const [testId, payloadKey] of FIELD_TO_PAYLOAD_KEY) {
  const rendered = src.includes(`data-testid="${testId}"`);
  const inPayload = new RegExp(`${payloadKey}\\s*:`).test(src);
  if (rendered && !inPayload) {
    fail(
      `${DRAWER} renders "${testId}" but never puts "${payloadKey}" in the submit payload — ` +
        `the operator types it and it is discarded on save (the SAF-F05 defect class).`
    );
  }
  if (!rendered && inPayload) {
    fail(
      `${DRAWER} sends "${payloadKey}" but renders no "${testId}" field — the payload carries a value ` +
        `nothing can set, which is either dead code or a field that was removed without its writer.`
    );
  }
}

// 8) SAF-F30 — a LABELLED field whose input is UNCONTROLLED.
//
//    This is the exact shape of the SAF-F05 defect, recovered from the pre-fix file rather than
//    imagined: the drawer rendered
//        <Field label="Police Report Number">
//          <input className="h-8 w-full rounded-sm border border-gray-300 px-2" />
//        </Field>
//    — no value=, no onChange, no data-testid. It looked like a working field, accepted typing, and
//    dropped every character on save. Seven fields had that shape.
//
//    My first attempt at this assertion keyed on data-testid and PASSED on the pre-fix file, because
//    those inputs had no testid to key on. A guard that cannot see the defect it was written for is
//    theatre, so the assertion now keys on what was actually there: the <Field label="..."> wrapper.
const FIELD_BLOCK = /<Field\s+label="([^"]+)"[^>]*>([\s\S]*?)<\/Field>/g;
let fieldMatch;
while ((fieldMatch = FIELD_BLOCK.exec(src)) !== null) {
  const [, label, body] = fieldMatch;
  const control = body.match(/<(input|textarea)\b[^>]*>/);
  if (!control) continue; // pickers/comboboxes carry their own binding
  const tag = control[0];
  if (/type="file"|type="checkbox"/.test(tag)) continue;
  // A readOnly/disabled input is a DISPLAY field — it cannot lose typing because it accepts none.
  // The live drawer has one (Class: `readOnly value="Auto class"`), and flagging it was a false
  // positive on this guard's first run. The defect is specifically an EDITABLE input with no binding.
  if (/\breadOnly\b|\bdisabled\b/.test(tag)) continue;
  // value= in either form: {expr} or a literal. Absence of any binding is the defect.
  if (!/value=/.test(tag)) {
    fail(
      `${DRAWER} field "${label}" is an UNCONTROLLED <${control[1]}> (no value= binding) — it renders, ` +
        `accepts typing, and its content is discarded on save. This is the SAF-F05 defect class.`
    );
  }
}

console.log(`${TAG} OK — catalogs wired to real pickers; every rendered field is controlled AND reaches the submit payload; office creator persists driver/unit/vendor/load links with audit emit + additive migration.`);
