#!/usr/bin/env node
// LEGAL-ERROR-SURFACING-GAP — guard
//
// Two /legal pages discarded the real API error and showed a static, unhelpful message on
// mutation failure, unlike every sibling legal page which uses userFacingApiError() to surface
// details.fieldErrors / details.message from a zod 400 or backend error code:
//  - LegalMatterNewPage.tsx: `createMut.isError ? <p>Could not create matter.</p> : null` — any
//    400 (duplicate matter_number, invalid enum, etc.) rendered the same generic text.
//  - LeaseToOwnCreatorModal.tsx: `pushToast(`Save failed: ${String((e as Error)?.message ?? e)}`)`
//    — bypassed userFacingApiError, so a validation_error toasted the bare literal
//    "Save failed: validation_error" instead of the actual field message.
// Live-confirmed via code read (not Chrome — this is a static error-surfacing gap, not a runtime
// 500): both siblings (LegalMatterDetailPage.tsx, SendContractModal.tsx/UnifiedContractCreatorModal.tsx/
// TruckLeaseCreatorModal.tsx) already use userFacingApiError correctly.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const NEW_MATTER_FILE = "apps/frontend/src/pages/legal/matters/LegalMatterNewPage.tsx";
const LEASE_MODAL_FILE = "apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx";

export function check(newMatterText, leaseModalText) {
  const failures = [];

  if (!/import\s*\{\s*userFacingApiError\s*\}\s*from\s*"..\/..\/..\/lib\/api-error-message"/.test(newMatterText)) {
    failures.push(`${NEW_MATTER_FILE} no longer imports userFacingApiError`);
  }
  if (!/userFacingApiError\(createMut\.error,\s*"Could not create matter\."\)/.test(newMatterText)) {
    failures.push(`${NEW_MATTER_FILE} create-error branch no longer surfaces the real API error via userFacingApiError`);
  }

  if (!/import\s*\{\s*userFacingApiError\s*\}\s*from\s*"..\/..\/..\/lib\/api-error-message"/.test(leaseModalText)) {
    failures.push(`${LEASE_MODAL_FILE} no longer imports userFacingApiError`);
  }
  if (!/onError:\s*\(e\)\s*=>\s*pushToast\(userFacingApiError\(e,\s*"Save failed"\),\s*"error"\)/.test(leaseModalText)) {
    failures.push(`${LEASE_MODAL_FILE} save-error handler no longer surfaces the real API error via userFacingApiError`);
  }

  return failures;
}

function run() {
  const newMatterText = fs.readFileSync(path.join(root, NEW_MATTER_FILE), "utf8");
  const leaseModalText = fs.readFileSync(path.join(root, LEASE_MODAL_FILE), "utf8");
  const failures = check(newMatterText, leaseModalText);
  if (failures.length > 0) {
    console.error("FAIL: legal-create-matter-error-surfacing");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: /legal create-matter + lease-to-own save error surfacing uses userFacingApiError");
}

function selftest() {
  const newMatterText = fs.readFileSync(path.join(root, NEW_MATTER_FILE), "utf8");
  const leaseModalText = fs.readFileSync(path.join(root, LEASE_MODAL_FILE), "utf8");

  const offenderA = newMatterText.replace(
    '{userFacingApiError(createMut.error, "Could not create matter.")}',
    "Could not create matter."
  );
  if (offenderA === newMatterText) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA, leaseModalText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (LegalMatterNewPage reverted) was NOT caught");
    process.exit(1);
  }

  const offenderB = leaseModalText.replace(
    'onError: (e) => pushToast(userFacingApiError(e, "Save failed"), "error"),',
    'onError: (e) => pushToast(`Save failed: ${String((e as Error)?.message ?? e)}`, "error"),'
  );
  if (offenderB === leaseModalText) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(newMatterText, offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (LeaseToOwnCreatorModal reverted) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
