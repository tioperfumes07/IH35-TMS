#!/usr/bin/env node
// DRIVER-SHEET-NO-PAY guard (owner order 2026-09-04, 09-04-2026-Cursor-Driver-Instruction-Sheet-
// FINAL-No-Pay): the driver instruction sheet must NOT show pay. The "Driver pay summary" section is
// removed and replaced by a "Border and customs" block (reads "Not a border load" when the load does
// not cross) and a "Documents you must bring back" checklist (BOL / POD / scale ticket / lumper).
// docType is "Driver instruction sheet", not "Driver dispatch sheet".
//
// Usage: node scripts/verify-driver-instruction-sheet-no-pay.mjs [--selftest]

import { readFileSync } from "node:fs";

const TEMPLATE = "apps/backend/src/render/dispatch-sheet.template.ts";
const ROUTES = "apps/backend/src/dispatch/dispatch-sheet.routes.ts";

function auditTemplate(src) {
  const f = [];
  if (/Driver pay summary/.test(src))
    f.push(`${TEMPLATE}: the driver instruction sheet must NOT render a "Driver pay summary" section (no pay)`);
  if (!/Border and customs/.test(src))
    f.push(`${TEMPLATE}: must render a "Border and customs" section`);
  if (!/Not a border load/.test(src))
    f.push(`${TEMPLATE}: the Border section must read "Not a border load" for a domestic load`);
  if (!/Documents you must bring back/.test(src))
    f.push(`${TEMPLATE}: must render the "Documents you must bring back" checklist`);
  return f;
}

function auditRoutes(src) {
  const f = [];
  if (!/docType: "Driver instruction sheet"/.test(src))
    f.push(`${ROUTES}: docType must be "Driver instruction sheet"`);
  // The route must NOT build a pay summary anymore.
  if (/payRows: DispatchPayRow\[\]/.test(src) || /grossFootnote:/.test(src))
    f.push(`${ROUTES}: the route still builds pay rows / a gross footnote — the driver sheet carries no pay`);
  // Border & documents must be built and passed to the model.
  if (!/isBorderLoad,/.test(src) || !/documents,/.test(src))
    f.push(`${ROUTES}: the model must receive isBorderLoad + documents`);
  if (!/is_border_load/.test(src))
    f.push(`${ROUTES}: the cross-border predicate (is_border_load) must be derived from crossing/border-stop data`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const templateSrc = readFileSync(TEMPLATE, "utf8");
  const routesSrc = readFileSync(ROUTES, "utf8");

  const failures = [...auditTemplate(templateSrc), ...auditRoutes(routesSrc)];
  if (failures.length) {
    console.error("FAIL verify-driver-instruction-sheet-no-pay:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }

  if (selftest) {
    const mut1 = templateSrc.replace(/Border and customs/, "Pay");
    if (auditTemplate(mut1).length === 0) {
      console.error("SELFTEST FAIL: removing the Border section did not trip the guard");
      process.exit(1);
    }
    const mut2 = routesSrc.replace(/docType: "Driver instruction sheet"/, 'docType: "Driver dispatch sheet"');
    if (auditRoutes(mut2).length === 0) {
      console.error("SELFTEST FAIL: reverting docType did not trip the guard");
      process.exit(1);
    }
    console.log("SELFTEST OK: guard trips on both mutations");
  }

  console.log("PASS verify-driver-instruction-sheet-no-pay");
}

main();
