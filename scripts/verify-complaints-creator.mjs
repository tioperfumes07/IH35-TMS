#!/usr/bin/env node
/**
 * FD3 regression guard — the Safety > Complaints creator (ComplaintsTab.tsx) must not regress to the
 * three shipped defects it fixes:
 *   1. RESPONDENT was a raw text <input placeholder="Respondent driver_id"> expecting a hand-typed UUID.
 *      → must use DriverPickerWithCreate server-search picker (never a placeholder matching /driver_id/i).
 *   2. TYPE was a free-text <input> while catalogs.complaint_types exists.
 *      → must be driven by the complaint-types catalog (listComplaintTypes) as a combobox.
 *   3. The disabled "+ Create" button gave no reason (silent dead control — locked-rule violation).
 *      → must render helper text listing the missing required fields.
 *
 * This guard is intentionally static (grep-style over the single tab file) and is negative-testable:
 * it FAILS on the pre-FD3 code (raw driver_id input, free-text type, no helper text) and PASSES on the
 * fixed code. Wired into `verify:arch-design`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx";

const abs = path.join(ROOT, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`[verify-complaints-creator] FAILED — expected file not found: ${TARGET}`);
  process.exit(1);
}
const src = fs.readFileSync(abs, "utf8");

const failures = [];

// (1) No raw respondent driver_id text input: an <input ... placeholder="...driver_id...">.
const DRIVER_ID_INPUT_RE = /<input\b[^>]*placeholder=(?:"[^"]*driver_id[^"]*"|'[^']*driver_id[^']*'|\{[^}]*driver_id[^}]*\})/i;
if (DRIVER_ID_INPUT_RE.test(src)) {
  failures.push('respondent is still a raw text <input> with a "driver_id" placeholder — use the listDrivers driver picker.');
}

// (2a) Respondent must use the shared server-search driver picker (SAF-B29 — no bulk listDrivers roster in-tab).
if (!/\bDriverPickerWithCreate\b/.test(src)) {
  failures.push("missing DriverPickerWithCreate — respondent must use company-scoped server-search driver picker, not raw UUID input.");
}
if (!/respondent_driver_id/.test(src)) {
  failures.push("respondent_driver_id form field not wired to the driver picker.");
}

// (3) Complaint TYPE must be catalog-driven (listComplaintTypes) and rendered as a combobox.
if (!/\blistComplaintTypes\b/.test(src)) {
  failures.push("missing listComplaintTypes — complaint TYPE must come from the complaint-types catalog, not free text.");
}
if (!/complaintTypesQuery/.test(src)) {
  failures.push("complaint-types catalog query not found — TYPE must be populated from catalogs.complaint_types.");
}
// Manage-types deep link into the catalog Lists page.
if (!/\/lists\/safety\/complaint-types/.test(src)) {
  failures.push('missing "Manage types" link to /lists/safety/complaint-types.');
}

// (4) No silent disable: a disabled create control must state which required fields are missing.
if (!/missingFields/.test(src)) {
  failures.push("no missing-fields helper computed — the disabled + Create control must state why it is disabled.");
}
if (!/missingFields\.join\(/.test(src)) {
  failures.push("missing-fields helper text not rendered (expected missingFields.join(...) under the creator).");
}

// Picker uses the shared combobox primitive rather than raw <select> churn.
if (!/\bSelectCombobox\b/.test(src)) {
  failures.push("expected SelectCombobox usage for the respondent and type pickers.");
}

// LV-COMPLAINTS-TAB-CANNOT-EXPRESS-DRIVER-OR-EMPLOYEE — dual-path complainant + respondent.
if (!/complainant_type/.test(src) || !/value="driver"/.test(src) || !/value="employee"/.test(src) || !/value="customer"/.test(src)) {
  failures.push("complainant_type must be selectable (driver/employee/customer/external/anonymous) — not hardcoded external.");
}
if (!/respondent_type/.test(src) || !/respondent_user_id/.test(src)) {
  failures.push("respondent_type must support employee via respondent_user_id (backend contract).");
}
if (!/\blistAssignableUsers\b/.test(src)) {
  failures.push("employee identity must use listAssignableUsers — not a raw UUID text box.");
}
if (!/\blistCustomers\b/.test(src) || !/complainant_customer_id/.test(src)) {
  failures.push("customer complainant must use listCustomers + complainant_customer_id.");
}

if (failures.length > 0) {
  console.error("[verify-complaints-creator] FAILED — Safety Complaints creator regressed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("[verify-complaints-creator] OK — respondent driver picker + catalog-driven type + missing-field helper present.");
