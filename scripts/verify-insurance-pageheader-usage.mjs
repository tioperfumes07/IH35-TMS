#!/usr/bin/env node
/**
 * verify-insurance-pageheader-usage
 *
 * Locks insurance-2-breadcrumb-desync: PolicyDetail must use the shared layout
 * PageHeader (← back + breadcrumb) instead of a bespoke "Back to policies" button.
 * Matches Safety detail pages (e.g. Photo Comparison) module-header pattern.
 */
import { readFileSync } from "node:fs";

const detailPath = "apps/frontend/src/pages/insurance/PolicyDetail.tsx";
const headerPath = "apps/frontend/src/components/layout/PageHeader.tsx";

export function check(detail, header) {
const failures = [];

if (!/from ["']\.\.\/\.\.\/components\/layout\/PageHeader["']/.test(detail)) {
  failures.push(
    `${detailPath}: must import PageHeader from components/layout/PageHeader (Safety module-header pattern).`
  );
}

if (!/<PageHeader[\s>]/.test(detail)) {
  failures.push(`${detailPath}: must render <PageHeader> for policy detail chrome.`);
}

// INS-443282 (#27400): Insurance is its own module at /insurance/* — the Safety-nested path is retired.
if (!/backHref=["']\/insurance\/policies["']/.test(detail)) {
  failures.push(
    `${detailPath}: PageHeader must set backHref="/insurance/policies" so ← returns to the policies list.`
  );
}

if (!/breadcrumb=\{/.test(detail)) {
  failures.push(`${detailPath}: PageHeader must receive a breadcrumb trail (module-header law).`);
}

if (!/subtitle=\{/.test(detail) && !/subtitle=["']/.test(detail)) {
  failures.push(`${detailPath}: PageHeader must keep the insurer · coverage · status subtitle.`);
}

if (!/Edit\s*\/\s*Update/.test(detail)) {
  failures.push(`${detailPath}: must keep the Edit / Update action on the header.`);
}

if (/Back to policies/.test(detail)) {
  failures.push(
    `${detailPath}: must NOT use a bespoke "Back to policies" button — shared PageHeader owns back navigation.`
  );
}

if (!/breadcrumb\b/.test(header) || !/backHref\b/.test(header)) {
  failures.push(`${headerPath}: layout PageHeader must support breadcrumb + backHref props.`);
}

return failures;
}

if (process.argv.includes("--selftest")) {
  const detail = readFileSync(detailPath, "utf8");
  const header = readFileSync(headerPath, "utf8");
  const plants = [
    ["back to the retired Safety-nested list", detail.replace('backHref="/insurance/policies"', 'backHref="/safety/insurance/policies"')],
    ["shared PageHeader removed", detail.split("<PageHeader").join("<div")],
    ["bespoke back button", detail + "\n// <button>Back to policies</button>"],
    ["breadcrumb dropped", detail.replace(/breadcrumb=\{/, "crumbs={")],
  ];
  let ok = check(detail, header).length === 0;
  if (!ok) console.error("SELFTEST FAIL — real source does not pass");
  for (const [name, mutated] of plants) {
    const caught = mutated !== detail && check(mutated, header).length > 0;
    console.log(`  ${caught ? "PASS" : "FAIL"}  planted "${name}" caught`);
    ok = ok && caught;
  }
  console.log(`verify-insurance-pageheader-usage SELFTEST ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

const failures = check(readFileSync(detailPath, "utf8"), readFileSync(headerPath, "utf8"));
if (failures.length > 0) {
  console.error("\n✗ verify-insurance-pageheader-usage: PolicyDetail PageHeader usage regressed.\n");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}

console.log(
  "✓ verify-insurance-pageheader-usage: PolicyDetail uses layout PageHeader with backHref + breadcrumb + Edit/Update."
);
