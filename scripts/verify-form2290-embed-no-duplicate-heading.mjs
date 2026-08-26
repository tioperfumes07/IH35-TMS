#!/usr/bin/env node
/**
 * DISP-F6471 (GO-2237 item 4) — the Form 2290 embed (Safety > Permits, `<Form2290Filings
 * showModuleHeader={false} />`) rendered "Form 2290 filings" THREE times stacked: PageHeader's own
 * title (always rendered), a decorative `<h2>Form 2290 filings</h2>` that only ever showed in the
 * exact same embedded branch (pure duplication, no unique content), and `embeddedBackLink` (a real
 * forward-navigation Link to /compliance/form-2290, added earlier to fix
 * FORM2290-EMBEDDED-NO-BACK-ARROW -- a genuinely different, intentional feature that happens to
 * share the same label text).
 *
 * This guard proves: (1) the decorative duplicate h2 is gone, (2) the legitimate
 * embeddedBackLink navigation feature was NOT regressed in the process (same fix, different
 * defect -- removing the wrong one would silently reopen an already-fixed finding), and (3)
 * PageHeader's own title still carries "Form 2290 filings" in both the standalone and embedded
 * branches (the one occurrence that should always render).
 *
 * Self-test: node scripts/verify-form2290-embed-no-duplicate-heading.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-form2290-embed-no-duplicate-heading";
const FILE = "apps/frontend/src/pages/compliance/Form2290Filings.tsx";

const CHECKS = [
  {
    name: "the decorative duplicate h2 (showModuleHeader ? null : <h2>Form 2290 filings</h2>) is gone",
    test: (text) => !/showModuleHeader \? null : \(\s*<h2[\s\S]{0,60}Form 2290 filings<\/h2>\s*\)/.test(text),
  },
  {
    name: "the legitimate embeddedBackLink forward-navigation Link is NOT regressed",
    test: (text) => /const embeddedBackLink = !showModuleHeader \? \(\s*<Link\s+to="\/compliance\/form-2290"/.test(text),
  },
  {
    name: "PageHeader's own title still renders \"Form 2290 filings\" in the early-return (no-company) branch",
    test: (text) => (text.match(/title="Form 2290 filings"/g) ?? []).length >= 2,
  },
];

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));

function collectFailures(text) {
  return CHECKS.filter((check) => !check.test(text)).map((check) => check.name);
}

const rawSource = fs.readFileSync(FILE, "utf8");
const source = stripComments(rawSource);

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(source);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    {
      name: "reintroduce the duplicate h2",
      text: source.replace(
        /(\{\/\* DISP-F6471[\s\S]{0,10}?\*\/\}|<p className="text-xs text-slate-600">)/,
        (m) => (m.startsWith("<p") ? `{showModuleHeader ? null : (<h2>Form 2290 filings</h2>)}\n${m}` : m)
      ),
    },
    {
      name: "delete the embeddedBackLink Link (regress FORM2290-EMBEDDED-NO-BACK-ARROW)",
      text: source.replace(/const embeddedBackLink = !showModuleHeader \? \(\s*<Link[\s\S]{0,220}\) : null;/, "const embeddedBackLink = null;"),
    },
    {
      name: "drop PageHeader's title in the early-return branch",
      text: (() => {
        let count = 0;
        return source.replace(/title="Form 2290 filings"/g, (m) => (++count === 1 ? 'title="X"' : m));
      })(),
    },
  ];
  let caught = 0;
  for (const m of mutations) {
    const failures = collectFailures(m.text);
    if (failures.length > 0) caught += 1;
    else console.error(`SELFTEST FAIL — mutation "${m.name}" was NOT caught`);
  }
  if (caught !== mutations.length) {
    console.error(`[${LABEL}] selftest: ${caught}/${mutations.length} mutations caught`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: ${caught}/${mutations.length} mutations caught`);
  process.exit(0);
}

const failures = collectFailures(source);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: duplicate h2 removed, forward-nav link + PageHeader title intact`);
