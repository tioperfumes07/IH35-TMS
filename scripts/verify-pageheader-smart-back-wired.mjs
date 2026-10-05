#!/usr/bin/env node
/**
 * ROUND 367.9 SUPERSEDES UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY.
 *
 * Owner 2026-10-03: Up is structural (Module › List › Record), never browser history.
 * Both PageHeader components must navigate via backHref || structuralParentHref(pathname).
 * hasInAppHistory / navigate(-1) on these headers is a REGRESSION.
 *
 * Filename kept (CLAIMED step continuity). Contract body updated to the structural law.
 */
import fs from "node:fs";

const HELPER_FILE = "apps/frontend/src/lib/structuralBreadcrumb.ts";
const HEADER_FILES = [
  "apps/frontend/src/components/layout/PageHeader.tsx",
  "apps/frontend/src/components/forms/shared/PageHeader.tsx",
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function auditHelper(source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/export function structuralParentHref\b/.test(stripped)) {
    failures.push(`${HELPER_FILE} must export structuralParentHref`);
  }
  if (!/export function structuralCrumbsForPath\b/.test(stripped)) {
    failures.push(`${HELPER_FILE} must export structuralCrumbsForPath`);
  }
  if (!/\/accounting/.test(source)) {
    failures.push(`${HELPER_FILE} must skip Accounting (CC-2 shell)`);
  }
  return failures;
}

function auditHeader(file, source) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(`${file}: ${message}`);
  };
  const stripped = stripComments(source);
  need(
    /structuralParentHref/.test(stripped),
    "must use structuralParentHref for Up when no explicit parent is provided",
  );
  need(
    /navigate\(\s*backHref\s*\|\|\s*structuralParentHref\(/.test(stripped),
    "back handler must navigate(backHref || structuralParentHref(...))",
  );
  need(
    !/hasInAppHistory/.test(stripped) && !/navigate\(\s*-1\s*\)/.test(stripped),
    "must not use hasInAppHistory or navigate(-1) — Up is structural (ROUND 367.9)",
  );
  return failures;
}

const helperSource = fs.readFileSync(HELPER_FILE, "utf8");
let failures = [...auditHelper(helperSource)];
const headerSources = HEADER_FILES.map((f) => fs.readFileSync(f, "utf8"));
headerSources.forEach((src, i) => {
  failures = failures.concat(auditHeader(HEADER_FILES[i], src));
});

if (failures.length) {
  console.error(`verify-pageheader-smart-back-wired FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "strip structuralParentHref from helper",
      target: "helper",
      mutate: (t) => t.replace("export function structuralParentHref", "export function structuralParentHrefREMOVED"),
    },
    {
      name: "remove structuralParentHref from layout/PageHeader",
      target: "header0",
      mutate: (t) => t.replace(/structuralParentHref/g, "MISSING"),
    },
    {
      name: "reintroduce navigate(-1) in forms/shared/PageHeader",
      target: "header1",
      mutate: (t) => t.replace(
        "navigate(backHref || structuralParentHref(location.pathname));",
        "navigate(-1);",
      ),
    },
  ];
  let caught = 0;
  for (const { name, target, mutate } of mutations) {
    let mHelper = helperSource;
    let mHeaders = [...headerSources];
    if (target === "helper") mHelper = mutate(helperSource);
    if (target === "header0") mHeaders[0] = mutate(headerSources[0]);
    if (target === "header1") mHeaders[1] = mutate(headerSources[1]);
    const changed = mHelper !== helperSource || mHeaders.some((h, i) => h !== headerSources[i]);
    if (!changed) throw new Error(`mutation "${name}" did not change any source -- test is inert`);
    const mutFailures = [
      ...auditHelper(mHelper),
      ...mHeaders.flatMap((src, i) => auditHeader(HEADER_FILES[i], src)),
    ];
    if (mutFailures.length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-pageheader-smart-back-wired SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log(
  "verify-pageheader-smart-back-wired PASS — both PageHeader components use structural Up (ROUND 367.9), never history",
);
