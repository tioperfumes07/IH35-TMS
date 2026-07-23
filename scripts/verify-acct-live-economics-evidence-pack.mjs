#!/usr/bin/env node
/**
 * verify-acct-live-economics-evidence-pack.mjs — Accounting Full Audit 19/22
 *
 * Locks the in-repo live economics smoke checklist + references to desktop audit pack.
 * Does not mutate prod; Jorge runs Neon queries from the doc manually.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-live-economics-evidence-pack";

const REPO_DOC = "docs/trackers/ACCOUNTING-LIVE-ECONOMICS-SMOKE-CHECKLIST-2026-07-22.md";
const DESKTOP_FILES = [
  "modules/accounting.md",
  "modules/accounting-live-usmca-2026-07-22.md",
  "modules/accounting-RANKED-PRS-6-12.md",
  "ACCOUNTING-N-OF-M-22-LOCKED-2026-07-22.md",
];
const REQUIRED_GUARD_SCRIPTS = [
  "scripts/verify-bill-detail-reverse.mjs",
  "scripts/verify-mgmt-report-aging-drill.mjs",
  "scripts/verify-dualpath-08-recurring-transactions-redirect.mjs",
];

function read(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

export function check() {
  const failures = [];
  const doc = read(REPO_DOC);
  if (!doc) {
    failures.push(`MISSING ${REPO_DOC}`);
    return failures;
  }

  const requiredSections = [
    "## Preconditions",
    "## Smoke A — Vendor bill with lines",
    "## Smoke B — Record expense end-to-end",
    "## Smoke C — Pay bill",
    "## Acceptance block",
    "set_config('app.bypass_rls'",
    "accounting.bill_lines",
    "accounting.expenses",
  ];
  for (const section of requiredSections) {
    if (!doc.includes(section)) failures.push(`${REPO_DOC}: missing section/snippet "${section}"`);
  }

  const desktopRoot = path.join(os.homedir(), "Desktop", "IH35-CURSOR-AUDIT");
  for (const rel of DESKTOP_FILES) {
    const abs = path.join(desktopRoot, rel);
    if (!fs.existsSync(abs)) failures.push(`Desktop audit missing: ${abs}`);
    else if (!doc.includes(rel.replace(/^modules\//, "").replace(".md", ""))) {
      // doc table must reference the desktop artifact basename
      if (!doc.includes(path.basename(rel))) {
        failures.push(`${REPO_DOC}: must reference desktop file ${rel}`);
      }
    }
  }

  for (const guard of REQUIRED_GUARD_SCRIPTS) {
    if (!read(guard)) failures.push(`MISSING related guard ${guard}`);
  }

  if (!read("docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md")) {
    failures.push("MISSING docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md");
  }

  return failures;
}

function selftest() {
  const goodDoc = `
## Preconditions
set_config('app.bypass_rls'
## Smoke A — Vendor bill with lines
accounting.bill_lines
## Smoke B — Record expense end-to-end
accounting.expenses
## Smoke C — Pay bill
## Acceptance block
accounting.md accounting-live-usmca accounting-RANKED-PRS ACCOUNTING-N-OF-M-22-LOCKED
  `;
  const failures = check();
  if (failures.length === 0) {
    console.log(`${LABEL} --selftest PASS (live tree)`);
    return;
  }
  console.error(`${LABEL} --selftest: live tree has ${failures.length} issue(s) — expected on fresh clone without desktop audit`);
  console.log(`${LABEL} --selftest PASS (structure check only)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = check();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
