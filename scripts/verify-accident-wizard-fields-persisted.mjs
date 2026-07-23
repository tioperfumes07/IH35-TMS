#!/usr/bin/env node
/**
 * GUARD: every field the accident wizard renders is controlled AND persisted (SAF-F05 / DoD layer B).
 *
 * WHY THIS EXISTS (2026-07-23 audit, verified on prod)
 * AccidentReportDrawer rendered 7 fields as UNCONTROLLED <input>s (no value/onChange) — Police Report
 * Number, Insurance Claim Number, Location, 3rd Party Name, 3rd Party Plate, Vendor Invoice, Bill/
 * Expense ref. Their columns did not exist on safety.accident_reports, and the save payload carried
 * none of them, so the operator's accident evidence was silently dropped on every save.
 *
 * DoD layer B: "every rendered field is controlled AND present in the submit payload." This guard ties
 * the four layers together so a field can never again render-but-not-persist: the drawer must control
 * it (value=), the API client type must declare it, the backend route must accept it (zod) AND write
 * it (INSERT + patchable), and the HOLD migration must add the column.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const CLIENT = "apps/frontend/src/api/safety.ts";
const ROUTE = "apps/backend/src/safety/safety.routes.ts";
const MIGRATION = "db/migrations/202607810000_accident_reports_capture_fields.sql";
const LABEL = "verify-accident-wizard-fields-persisted";
const SELFTEST = process.argv.includes("--selftest");

// snake_case column ↔ camelCase drawer state, and the testid the input must carry.
const FIELDS = [
  { col: "police_report_number", state: "policeReportNumber", testid: "accident-police-report-number" },
  { col: "insurance_claim_number", state: "insuranceClaimNumber", testid: "accident-insurance-claim-number" },
  { col: "location", state: "location", testid: "accident-location" },
  { col: "third_party_name", state: "thirdPartyName", testid: "accident-third-party-name" },
  { col: "third_party_plate", state: "thirdPartyPlate", testid: "accident-third-party-plate" },
  { col: "vendor_invoice_number", state: "vendorInvoiceNumber", testid: "accident-vendor-invoice-number" },
  { col: "bill_or_expense_ref", state: "billOrExpenseRef", testid: "accident-bill-or-expense-ref" },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertAccidentFieldsPersisted(sources) {
  const drawer = sources?.[DRAWER] ?? read(DRAWER);
  const client = sources?.[CLIENT] ?? read(CLIENT);
  const route = sources?.[ROUTE] ?? read(ROUTE);
  const migration = sources?.[MIGRATION] ?? read(MIGRATION);
  const problems = [];

  for (const f of FIELDS) {
    // 1. Drawer controls the input (value={state}) — not uncontrolled, not defaultValue.
    const controlled = new RegExp(`value=\\{${f.state}\\}`).test(drawer);
    if (!controlled) {
      problems.push(`${DRAWER}: input for ${f.col} is not controlled (expected value={${f.state}}) — a rendered-but-uncontrolled field is discarded on save.`);
    }
    if (!drawer.includes(`data-testid="${f.testid}"`)) {
      problems.push(`${DRAWER}: input for ${f.col} is missing data-testid="${f.testid}".`);
    }
    // 2. Drawer sends it in the payload.
    if (!new RegExp(`${f.col}:\\s*${f.state}`).test(drawer)) {
      problems.push(`${DRAWER}: ${f.col} is not in the save payload — it is controlled but never sent.`);
    }
    // 3. API client type declares it.
    if (!new RegExp(`${f.col}\\?:\\s*string`).test(client)) {
      problems.push(`${CLIENT}: CreateAccidentInput/PatchAccidentInput does not declare ${f.col}.`);
    }
    // 4. Backend accepts (zod) + writes it (INSERT column list) + patchable.
    if (!new RegExp(`${f.col}:\\s*accidentTextField`).test(route)) {
      problems.push(`${ROUTE}: the accident zod schema does not accept ${f.col}.`);
    }
    // A column line in the INSERT list — the LAST column has no trailing comma (followed by `)`), so
    // accept comma OR newline after the name.
    if (!new RegExp(`\\n\\s*${f.col}[,\\n]`).test(route)) {
      problems.push(`${ROUTE}: the INSERT column list does not include ${f.col} — accepted but not written.`);
    }
    if (!new RegExp(`key:\\s*"${f.col}"`).test(route)) {
      problems.push(`${ROUTE}: ${f.col} is not in the PATCH patchable whitelist — a patch would drop it.`);
    }
    // 5. Migration adds the column.
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${f.col}\\b`).test(migration)) {
      problems.push(`${MIGRATION}: does not ADD COLUMN ${f.col} — the write would 500 (phantom column).`);
    }
  }
  return problems;
}

if (SELFTEST) {
  const live = {
    [DRAWER]: read(DRAWER),
    [CLIENT]: read(CLIENT),
    [ROUTE]: read(ROUTE),
    [MIGRATION]: read(MIGRATION),
  };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: mutation did not change source — inert`);
      return;
    }
    const problems = assertAccidentFieldsPersisted(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  // 1. an input goes back to uncontrolled.
  expectCaught("uncontrolled-input", { ...live, [DRAWER]: live[DRAWER].replace("value={location}", "") }, "not controlled");
  // 2. the migration drops a column.
  expectCaught("missing-column", { ...live, [MIGRATION]: live[MIGRATION].replace("ADD COLUMN IF NOT EXISTS location", "-- removed") }, "does not ADD COLUMN location");
  // 3. the backend stops writing a column (INSERT).
  expectCaught("insert-drops-field", { ...live, [ROUTE]: live[ROUTE].replace(/\n            third_party_name,/, "") }, "INSERT column list does not include third_party_name");
  // 4. the payload stops sending a field.
  expectCaught("payload-drops-field", { ...live, [DRAWER]: live[DRAWER].replace(/police_report_number: policeReportNumber\.trim\(\) \|\| null,/, "") }, "police_report_number is not in the save payload");

  const liveProblems = assertAccidentFieldsPersisted(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 4 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertAccidentFieldsPersisted();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all 7 accident wizard fields are controlled, sent, accepted, written, and columned`);
