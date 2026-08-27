#!/usr/bin/env node
// LEGAL-MATTER-CLOSE-NO-CONFIRM + REQUIRED-DOC-DEACTIVATE-NO-CONFIRM — guard
//
// Two terminal/hard-to-reverse actions fired their mutation directly on click, with no
// confirmation step, inconsistent with this codebase's own established pattern (the shared
// ConfirmModal component; DeactivateFactorConfirmModal for the exact word "Deactivate";
// TerminateConfirmModal for a comparable terminal driver-status transition):
//  - LegalMatterDetailPage.tsx's "Close matter" button — closing is terminal ("reopen not
//    supported via edit" per the edit form's own read-only note).
//  - RequiredDocumentsSection.tsx's "Deactivate" button — the list filters is_active=true with no
//    reactivate affordance anywhere in the section, so deactivating silently drops a compliance
//    enforcement rule (possibly hard_block) with no visible way back.
// Both now gate behind ConfirmModal before the mutation fires.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const MATTER_FILE = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";
const DOCS_FILE = "apps/frontend/src/pages/compliance/RequiredDocumentsSection.tsx";

export function check(matterText, docsText) {
  const failures = [];

  if (!/import\s*\{\s*ConfirmModal\s*\}\s*from\s*"..\/..\/..\/components\/shared\/ConfirmModal"/.test(matterText)) {
    failures.push(`${MATTER_FILE} no longer imports ConfirmModal`);
  }
  if (!/onClick=\{\(\)\s*=>\s*setCloseConfirmOpen\(true\)\}/.test(matterText)) {
    failures.push(`${MATTER_FILE} "Close matter" button no longer opens a confirm gate`);
  }
  if (!/<ConfirmModal[\s\S]{0,200}open=\{closeConfirmOpen\}/.test(matterText)) {
    failures.push(`${MATTER_FILE} no ConfirmModal wired to closeConfirmOpen`);
  }

  if (!/import\s*\{\s*ConfirmModal\s*\}\s*from\s*"..\/..\/components\/shared\/ConfirmModal"/.test(docsText)) {
    failures.push(`${DOCS_FILE} no longer imports ConfirmModal`);
  }
  if (!/onClick=\{\(\)\s*=>\s*setDeactivateTarget\(row\)\}/.test(docsText)) {
    failures.push(`${DOCS_FILE} "Deactivate" button no longer opens a confirm gate`);
  }
  if (!/<ConfirmModal[\s\S]{0,200}open=\{Boolean\(deactivateTarget\)\}/.test(docsText)) {
    failures.push(`${DOCS_FILE} no ConfirmModal wired to deactivateTarget`);
  }

  return failures;
}

function run() {
  const matterText = fs.readFileSync(path.join(root, MATTER_FILE), "utf8");
  const docsText = fs.readFileSync(path.join(root, DOCS_FILE), "utf8");
  const failures = check(matterText, docsText);
  if (failures.length > 0) {
    console.error("FAIL: legal-compliance-destructive-confirm");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Close matter + required-doc Deactivate both gate behind ConfirmModal");
}

function selftest() {
  const matterText = fs.readFileSync(path.join(root, MATTER_FILE), "utf8");
  const docsText = fs.readFileSync(path.join(root, DOCS_FILE), "utf8");

  const offenderA = matterText.replace(
    "onClick={() => setCloseConfirmOpen(true)}",
    "onClick={() => void closeMut.mutate()}"
  );
  if (offenderA === matterText) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderA, docsText).length === 0) {
    console.error("FAIL(selftest): planted offender (Close matter confirm removed) was NOT caught");
    process.exit(1);
  }

  const offenderB = docsText.replace(
    "onClick={() => setDeactivateTarget(row)}",
    'onClick={() => patch.mutate({ id: row.id, input: { operating_company_id: operatingCompanyId, is_active: false } })}'
  );
  if (offenderB === docsText) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(matterText, offenderB).length === 0) {
    console.error("FAIL(selftest): planted offender (Deactivate confirm removed) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
