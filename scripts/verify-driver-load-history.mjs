#!/usr/bin/env node
/**
 * Guard: verify-driver-load-history.mjs
 *
 * Asserts the Driver Profile > Load History tab has:
 *  - status filter (select/dropdown for status)
 *  - date range picker (DatePicker or date inputs for the assigned loads table)
 *  - Export CSV button
 *  - Print/PDF button (window.print)
 *  - Rate column using formatUsdCents
 *  - click-to-load (EntityLink or link to /dispatch/loads/)
 *  - mmmDd for dates (not toLocaleDateString)
 *  - no visible "None"/"null"/"undefined" text
 *
 * Exits 0 if all pass, 1 otherwise.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(
  process.cwd(),
  "apps/frontend/src/components/drivers/LoadHistoryTab.tsx",
);

let src;
try {
  src = readFileSync(FILE, "utf8");
} catch (err) {
  console.error(`FAIL: could not read ${FILE}: ${err.message}`);
  process.exit(1);
}

const checks = [
  {
    name: "status filter (select/dropdown for status)",
    pass: /<select[\s\S]*?data-testid="driver-assigned-loads-status-filter"/.test(src),
  },
  {
    name: "date range picker for assigned loads (DatePicker)",
    pass: /driver-assigned-loads-filter-from/.test(src) &&
      /driver-assigned-loads-filter-to/.test(src) &&
      /DatePicker/.test(src),
  },
  {
    name: "Export CSV button",
    pass: /Export CSV/.test(src) && /exportCsv/.test(src),
  },
  {
    name: "Print/PDF button (window.print)",
    pass: /window\.print/.test(src) && /Print/.test(src),
  },
  {
    name: "Rate column using formatUsdCents",
    pass: /formatUsdCents/.test(src) && /rate_total_cents/.test(src),
  },
  {
    name: "click-to-load (EntityLink or link to /dispatch/loads/)",
    pass: /EntityLink/.test(src) && /kind="load"/.test(src),
  },
  {
    name: "mmmDd for dates (imported and used)",
    pass: /import.*\bmmmDd\b.*from/.test(src) && /mmmDd\(/.test(src),
  },
  {
    name: "no toLocaleDateString in date columns",
    pass: !/toLocaleDateString/.test(src),
  },
  {
    name: 'no visible "None"/"null"/"undefined" text in render',
    pass: !/>None<|>null<|>undefined</.test(src),
  },
  {
    name: "dash-never-zero pattern (em-dash fallback)",
    pass: /—"|: "—"/.test(src) || /"—"/.test(src),
  },
];

let failed = 0;
for (const c of checks) {
  if (c.pass) {
    console.log(`PASS: ${c.name}`);
  } else {
    console.error(`FAIL: ${c.name}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed in ${FILE}`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} checks passed.`);
process.exit(0);
