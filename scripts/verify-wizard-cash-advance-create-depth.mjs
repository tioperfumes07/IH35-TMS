#!/usr/bin/env node
/**
 * verify-wizard-cash-advance-create-depth — WIZARD-CASH-ADVANCE-CREATE-DEPTH
 *
 * Locks owner 2026-07-22 Create Advance wizard depth:
 *   - no hardcoded "BOA / IBC" disbursement labels
 *   - ParityDrawer (not nested boxes-in-boxes modal chrome)
 *   - load_id + recovery_mode full|amortize / next settlement UX
 *   - bank account field for transfer
 *   - create schema includes load_id + recovery_mode (+ unit/trailer/economic_routing)
 *
 * Self-test: node scripts/verify-wizard-cash-advance-create-depth.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, failures) {
  if (!cond) failures.push(msg);
}

function checkModal(source, failures, label = "CreateAdvanceModal") {
  assert(!/BOA\s*\/\s*IBC/i.test(source), `${label}: must not hardcode BOA / IBC in disbursement labels`, failures);
  assert(/ParityDrawer/.test(source), `${label}: must use ParityDrawer (flat money creator chrome)`, failures);
  assert(!/<Modal[\s/>]/.test(source), `${label}: must not open bare Modal shell`, failures);
  assert(/load_id|data-field=\"load_id\"/.test(source), `${label}: must expose load_id / Load picker`, failures);
  assert(/recovery_mode|Next settlement/i.test(source), `${label}: must expose recovery_mode / next settlement UX`, failures);
  assert(/amortize/i.test(source), `${label}: must expose amortize recovery mode`, failures);
  assert(/full/.test(source), `${label}: must expose full recovery mode`, failures);
  assert(
    /from_bank_account|Bank account|getAllAccounts/i.test(source),
    `${label}: must have bank account select for transfer`,
    failures
  );
  assert(
    /CreateDriverModal/.test(source) || /DriverPickerWithCreate/.test(source),
    `${label}: must keep nested driver +Create (CreateDriverModal or DriverPickerWithCreate)`,
    failures
  );
  assert(/lumper/i.test(source), `${label}: must include lumper purpose → load expense path`, failures);
  // Nested boxes-in-boxes anti-pattern: slate bordered panel wrappers for bill/repayment
  assert(
    !/rounded-sm border border-slate-300 bg-slate-100/.test(source),
    `${label}: must not use nested slate bordered bill box`,
    failures
  );
}

function checkRoutes(source, failures) {
  assert(/load_id/.test(source), "create schema must include load_id", failures);
  assert(/recovery_mode/.test(source), "create schema must include recovery_mode", failures);
  assert(/from_bank_account_id/.test(source), "create schema must include from_bank_account_id", failures);
  assert(/unit_id/.test(source), "create schema must include unit_id", failures);
  assert(/trailer_id/.test(source), "create schema must include trailer_id", failures);
  assert(/lumper/.test(source), "create schema must allow purpose=lumper", failures);
  assert(/full/.test(source) && /amortize/.test(source), "create schema must allow recovery_mode full|amortize", failures);
}

function checkCreateCore(source, failures) {
  assert(/resolveEconomicRouting/.test(source), "core must resolve economic routing", failures);
  assert(/load_expense/.test(source), "core must support load_expense routing", failures);
  assert(/from_bank_account_id/.test(source), "core must accept from_bank_account_id", failures);
}

function checkApi(source, failures) {
  assert(/load_id/.test(source), "FE API payload must include load_id", failures);
  assert(/recovery_mode/.test(source), "FE API payload must include recovery_mode", failures);
  assert(/from_bank_account_id/.test(source), "FE API payload must include from_bank_account_id", failures);
}

function runSelftest() {
  const failures = [];
  const goodModal = `
    <ParityDrawer title="Create Advance">
      data-field="load_id" recovery_mode Next settlement amortize full
      Bank account getAllAccounts CreateDriverModal lumper
    </ParityDrawer>
  `;
  checkModal(goodModal, failures, "selftest-good");
  const badModal = `Direct bank transfer (BOA / IBC checking) <Modal> repayment`;
  const badFails = [];
  checkModal(badModal, badFails, "selftest-bad");
  if (badFails.length < 3) failures.push("selftest-bad should fail multiple assertions");
  if (failures.length) {
    console.error("SELFTEST FAIL", failures);
    process.exit(1);
  }
  console.log("SELFTEST PASS");
}

function main() {
  if (process.argv.includes("--selftest")) {
    runSelftest();
    return;
  }
  const failures = [];
  checkModal(read("apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx"), failures);
  checkRoutes(read("apps/backend/src/cash-advances/cash-advances.routes.ts"), failures);
  checkCreateCore(read("apps/backend/src/cash-advances/cash-advance-create.ts"), failures);
  checkApi(read("apps/frontend/src/api/cashAdvances.ts"), failures);

  const migration = "db/migrations/202607720000_driver_advance_wizard_depth.sql";
  assert(fs.existsSync(path.join(ROOT, migration)), `missing ${migration}`, failures);

  if (failures.length) {
    console.error("FAIL verify-wizard-cash-advance-create-depth:");
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  console.log("PASS verify-wizard-cash-advance-create-depth");
}

main();
