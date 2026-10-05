#!/usr/bin/env node
/**
 * UI-BACK-BUTTON audit wave 2 — updated for ROUND 367.9 / U18.
 *
 * BackArrowHeader: structural navigate(backTo) — never history.
 * AccountingSubNavWrapper: breadcrumb way back (CC-2), never history.
 * BackButton: structuralParentHref / fallbackTo — never navigate(-1).
 */
import fs from "node:fs";

const BACK_ARROW_HEADER = "apps/frontend/src/components/layout/BackArrowHeader.tsx";
const ACCOUNTING_WRAPPER = "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx";
const REG007_FILES = [
  "apps/frontend/src/components/shared/BackButton.tsx",
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function auditBackArrowHeader(source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/navigate\(\s*backTo\s*\)/.test(stripped)) {
    failures.push(`${BACK_ARROW_HEADER}: must navigate(backTo) — structural parent route`);
  }
  if (/hasInAppHistory|navigate\(\s*-1\s*\)/.test(stripped)) {
    failures.push(`${BACK_ARROW_HEADER}: must not use hasInAppHistory or navigate(-1) (ROUND 367.9)`);
  }
  if (!/<span>Back<\/span>/.test(stripped)) {
    failures.push(`${BACK_ARROW_HEADER}: must show a visible Back label (not icon-only)`);
  }
  if (stripped.includes("text-[11px]")) {
    failures.push(`${BACK_ARROW_HEADER}: leftover text-[11px]`);
  }
  if (source.includes("#8A92AB")) {
    failures.push(`${BACK_ARROW_HEADER}: leftover off-scale muted #8A92AB`);
  }
  return failures;
}

function auditAccountingWrapper(source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/<Breadcrumb items=\{breadcrumb\}/.test(stripped)) {
    failures.push(`${ACCOUNTING_WRAPPER}: must render the Accounting breadcrumb (the way back to the module home)`);
  }
  if (!/\{ label: "Accounting", href: "\/accounting" \}/.test(stripped)) {
    failures.push(`${ACCOUNTING_WRAPPER}: the breadcrumb's first link must be the Accounting home (/accounting)`);
  }
  if (/hasInAppHistory|navigate\(-1\)|history\.back\(/.test(stripped)) {
    failures.push(`${ACCOUNTING_WRAPPER}: must not go back through browser history (U18)`);
  }
  if (stripped.includes("text-[11px]")) {
    failures.push(`${ACCOUNTING_WRAPPER}: must not use text-[11px] — use text-xs`);
  }
  return failures;
}

function auditReg007(file, source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/structuralParentHref/.test(stripped)) {
    failures.push(`${file}: must use structuralParentHref for Up (ROUND 367.9)`);
  }
  if (/hasInAppHistory|onClick=\{\(\)\s*=>\s*navigate\(-1\)\}|navigate\(\s*-1\s*\)/.test(stripped)) {
    failures.push(`${file}: must not use history-based back (ROUND 367.9)`);
  }
  return failures;
}

const backArrowSource = fs.readFileSync(BACK_ARROW_HEADER, "utf8");
const accountingSource = fs.readFileSync(ACCOUNTING_WRAPPER, "utf8");

let failures = [...auditBackArrowHeader(backArrowSource), ...auditAccountingWrapper(accountingSource)];
for (const f of REG007_FILES) failures.push(...auditReg007(f, fs.readFileSync(f, "utf8")));

if (failures.length) {
  console.error(`verify-backarrowheader-and-accounting-back-wired FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "reintroduce navigate(-1) in BackArrowHeader",
      target: "backArrow",
      mutate: (t) => t.replace("navigate(backTo);", "navigate(-1);"),
    },
    {
      name: "remove the breadcrumb from AccountingSubNavWrapper entirely",
      target: "accounting",
      mutate: (t) => t.replace("<Breadcrumb items={breadcrumb} />", ""),
    },
    {
      name: "strip visible Back label from BackArrowHeader (icon-only regression)",
      target: "backArrow",
      mutate: (t) => t.replace("<span>Back</span>", ""),
    },
    {
      name: "AccountingSubNavWrapper breadcrumb no longer starts at the Accounting home",
      target: "accounting",
      mutate: (t) => t.replace('{ label: "Accounting", href: "/accounting" }', '{ label: "Accounting", href: "/home" }'),
    },
    {
      name: "AccountingSubNavWrapper goes back through browser history again",
      target: "accounting",
      mutate: (t) => t.replace("<Breadcrumb items={breadcrumb} />", "<Breadcrumb items={breadcrumb} /><button onClick={() => navigate(-1)}>Back</button>"),
    },
    {
      name: "AccountingSubNavWrapper Back control off-scale text-[11px]",
      target: "accounting",
      mutate: (t) => t.replace('<div data-testid="accounting-breadcrumb">', '<div data-testid="accounting-breadcrumb" className="text-[11px]">'),
    },
    {
      name: "BackArrowHeader leftover text-[11px] plant",
      target: "backArrow",
      mutate: (t) => t + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n',
    },
  ];
  let caught = 0;
  for (const { name, target, mutate } of mutations) {
    let mBackArrow = backArrowSource;
    let mAccounting = accountingSource;
    if (target === "backArrow") mBackArrow = mutate(backArrowSource);
    if (target === "accounting") mAccounting = mutate(accountingSource);

    const changed = mBackArrow !== backArrowSource || mAccounting !== accountingSource;
    if (!changed) throw new Error(`mutation "${name}" did not change any source -- test is inert`);

    const mutFailures = [...auditBackArrowHeader(mBackArrow), ...auditAccountingWrapper(mAccounting)];
    if (mutFailures.length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  let reg007Caught = 0;
  const reg007Mutations = [];
  for (const f of REG007_FILES) {
    reg007Mutations.push({
      name: `strip structuralParentHref from ${f}`,
      file: f,
      mutate: (t) => t.replace(/structuralParentHref/g, "MISSING"),
    });
    reg007Mutations.push({
      name: `reintroduce bare navigate(-1) in ${f}`,
      file: f,
      mutate: (t) => `${t}\n<button onClick={() => navigate(-1)} />`,
    });
  }
  for (const { name, file, mutate } of reg007Mutations) {
    const orig = fs.readFileSync(file, "utf8");
    const mutated = mutate(orig);
    if (mutated === orig) throw new Error(`REG-007 mutation "${name}" did not change source — inert`);
    if (auditReg007(file, mutated).length === 0) throw new Error(`REG-007 mutation escaped: "${name}"`);
    reg007Caught += 1;
  }
  console.log(`verify-backarrowheader-and-accounting-back-wired SELFTEST PASS — ${caught}/${mutations.length} + REG-007 ${reg007Caught}/${reg007Mutations.length} mutations detected`);
}

console.log(
  "verify-backarrowheader-and-accounting-back-wired PASS — BackArrowHeader structural Up + visible Back; AccountingSubNavWrapper breadcrumb home (U18); BackButton structuralParentHref",
);
