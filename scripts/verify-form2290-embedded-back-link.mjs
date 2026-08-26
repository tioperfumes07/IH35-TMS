#!/usr/bin/env node
/**
 * GUARD — verify-form2290-embedded-back-link
 *
 * FORM2290-EMBEDDED-NO-BACK-ARROW: Form2290Filings.tsx's `showModuleHeader={false}` embedding
 * (used by Safety → Permits) correctly suppresses the full PageHeader (title/subtitle/breadcrumb,
 * to avoid a duplicate nested header on top of Safety's own) but that ALSO silently dropped
 * PageHeader's back arrow entirely — live-reproduced on /safety/permits: the embedded "Form 2290
 * filings" section had no "←" anywhere, no way back to the standalone /compliance/form-2290 view.
 *
 * METHOD: static source-text assertions on Form2290Filings.tsx. --selftest mutates the REAL file
 * and requires each planted offender to be caught.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-form2290-embedded-back-link";
const TARGET = "apps/frontend/src/pages/compliance/Form2290Filings.tsx";

export function check(text) {
  const problems = [];

  if (!/import \{ Link, useSearchParams \} from "react-router-dom"/.test(text)) {
    problems.push("does not import Link from react-router-dom alongside useSearchParams.");
  }
  if (!/const embeddedBackLink = !showModuleHeader \? \(/.test(text)) {
    problems.push("embeddedBackLink is not defined (or no longer gated on !showModuleHeader).");
  }
  if (!/<Link\s+to="\/compliance\/form-2290"/.test(text)) {
    problems.push('embeddedBackLink does not point at "/compliance/form-2290".');
  }
  // Both showModuleHeader===false early-return branches must render the back link. Anchor each
  // slice uniquely (not by a generic "if (!showModuleHeader)" lastIndexOf, which would silently
  // fall back to the OTHER branch once one of the two is mutated away, masking the offender).
  const noCompanyBranch = text.slice(text.indexOf("if (!companyId)"), text.indexOf("const filings ="));
  if (!/\{embeddedBackLink\}/.test(noCompanyBranch)) {
    problems.push("the no-company-selected embedded branch does not render embeddedBackLink.");
  }
  const bodyDeclIdx = text.indexOf("const body = (");
  const bodyBranch = bodyDeclIdx === -1 ? "" : text.slice(bodyDeclIdx);
  if (!/\{embeddedBackLink\}/.test(bodyBranch)) {
    problems.push("the main-body embedded branch does not render embeddedBackLink.");
  }

  return problems;
}

function run() {
  const text = readFileSync(TARGET, "utf8");
  const problems = check(text);
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Form2290Filings renders a back link to /compliance/form-2290 in both showModuleHeader=false branches.`);
}

function selftest() {
  const real = readFileSync(TARGET, "utf8");
  const failures = [];

  const baseline = check(real);
  if (baseline.length) failures.push(`baseline (real fixed file) should pass, got: ${baseline.join(" | ")}`);

  // Offender 1: remove the Link import (revert to bare useSearchParams import).
  const o1 = real.replace('import { Link, useSearchParams } from "react-router-dom";', 'import { useSearchParams } from "react-router-dom";');
  const p1 = check(o1);
  if (!p1.some((m) => m.includes("does not import Link"))) {
    failures.push(`offender-1 (missing Link import) NOT caught: ${p1.join(" | ") || "none"}`);
  }

  // Offender 2: remove embeddedBackLink from the no-company branch.
  const noCompanyNeedle = [
    "        {embeddedBackLink}",
    "        {empty}",
  ].join("\n");
  const o2 = real.replace(noCompanyNeedle, "        {empty}");
  if (o2 === real) failures.push("offender-2 mutation did not change the file — guard's own slice/regex may be stale.");
  const p2 = check(o2);
  if (!p2.some((m) => m.includes("no-company-selected embedded branch"))) {
    failures.push(`offender-2 (no-company branch reverted) NOT caught: ${p2.join(" | ") || "none"}`);
  }

  // Offender 3: remove embeddedBackLink from the main body branch.
  const bodyBranchNeedle = [
    "  if (!showModuleHeader) {",
    "    return (",
    '      <div className="space-y-4">',
    "        {header}",
    "        {embeddedBackLink}",
    "        {body}",
    "      </div>",
    "    );",
    "  }",
  ].join("\n");
  const o3 = real.replace(bodyBranchNeedle, "  if (!showModuleHeader) return body;");
  if (o3 === real) failures.push("offender-3 mutation did not change the file — guard's own slice/regex may be stale.");
  const p3 = check(o3);
  if (!p3.some((m) => m.includes("main-body embedded branch"))) {
    failures.push(`offender-3 (main body branch reverted) NOT caught: ${p3.join(" | ") || "none"}`);
  }

  // Offender 4: point the link at the wrong path.
  const o4 = real.replace('to="/compliance/form-2290"', 'to="/compliance"');
  const p4 = check(o4);
  if (!p4.some((m) => m.includes('does not point at "/compliance/form-2290"'))) {
    failures.push(`offender-4 (wrong link target) NOT caught: ${p4.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 4/4 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
