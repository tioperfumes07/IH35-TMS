#!/usr/bin/env node
// MAINT-X8-01 (Codex X.8, owner row #21 2026-09-05: "WO create/edit comboboxes").
//
// Root cause: docs/CLAUDE.md §10 locks "Combobox is the office standard for dropdowns." The CREATE
// side of CreateWorkOrderModal.tsx (CreateWOSectionIdentification/PaymentTiming/CostBreakdown) was
// already built on SimpleCombobox/SelectCombobox — but the EDIT header (Priority, Bucket, Repaired
// by, Service location) and the edit-mode cost-line Type cell had regressed to six bare native
// `<select>` elements inside the SAME modal. An operator editing an existing WO saw the office's
// native-select chrome right next to comboboxes on create — an inconsistent, unlocked control.
//
// This guard is static (source-text assertion, no DB/browser) and scoped to the one file this PR
// fixes: FAILS if a bare `<select` re-appears in CreateWorkOrderModal.tsx. `codex/` branches are
// the chrome-only lane under verify-verify-step-lane-band.mjs and cannot claim a new numbered
// scripts/verify-steps/NNNN step, so — same as verify-fleet-table-header-design-contract.mjs — this
// lives at the root, picked up by `npm run verify:static`.
//
// Usage: node scripts/verify-wo-edit-comboboxes.mjs [--selftest]

import { readFileSync } from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";

function audit(src) {
  const f = [];
  if (/<select\b/.test(src)) {
    f.push(`${FILE}: a bare <select> element was found — every dropdown in this modal (create AND edit) must use SimpleCombobox/SelectCombobox from components/Combobox.tsx (docs/CLAUDE.md §10 office-standard rule)`);
  }
  if (!/import\s*\{[^}]*SelectCombobox[^}]*\}\s*from\s*"\.\.\/\.\.\/\.\.\/components\/Combobox"/.test(src)) {
    f.push(`${FILE}: must import SelectCombobox from ../../../components/Combobox`);
  }
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(FILE, "utf8");
  const failures = audit(src);

  if (failures.length) {
    console.error("FAIL verify-wo-edit-comboboxes:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const mutated = src.replace(
      /<SelectCombobox\s+data-testid="edit-wo-priority"/,
      '<select data-testid="edit-wo-priority"'
    );
    if (audit(mutated).length === 0) {
      console.error("SELFTEST FAIL: a reintroduced <select> did not trip");
      process.exit(1);
    }
    console.log("SELFTEST OK: guard trips on regression");
  }

  console.log("PASS verify-wo-edit-comboboxes");
}

main();
