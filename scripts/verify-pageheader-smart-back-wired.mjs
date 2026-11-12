#!/usr/bin/env node
/**
 * ROUND 8.17 class R SUPERSEDES ROUND 367.9 / 435-CUR PageHeader Back contract.
 *
 * Up prefers `ret` (origin board tab/filters/period/cohort, including cross-module).
 * Without `ret`, resolveBackHref falls through to inModuleBackHref (never history).
 * Both PageHeader components must navigate via resolveBackHref({ searchParams, pathname, fallback: backHref }).
 */
import fs from "node:fs";

const HELPER_FILE = "apps/frontend/src/lib/structuralBreadcrumb.ts";
const RETURN_FILE = "apps/frontend/src/lib/returnContext.ts";
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
  if (!/export function inModuleBackHref\b/.test(stripped)) {
    failures.push(`${HELPER_FILE} must export inModuleBackHref (ROUND 435-CUR fallback)`);
  }
  if (!/export function structuralCrumbsForPath\b/.test(stripped)) {
    failures.push(`${HELPER_FILE} must export structuralCrumbsForPath`);
  }
  if (!/\/accounting/.test(source)) {
    failures.push(`${HELPER_FILE} must skip Accounting (CC-2 shell)`);
  }
  return failures;
}

function auditReturn(source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/export function resolveBackHref\b/.test(stripped)) {
    failures.push(`${RETURN_FILE} must export resolveBackHref`);
  }
  if (!/inModuleBackHref/.test(stripped)) {
    failures.push(`${RETURN_FILE}: resolveBackHref must fall through to inModuleBackHref when ret absent`);
  }
  if (!/RETURN_PARAM|\"ret\"/.test(stripped)) {
    failures.push(`${RETURN_FILE} must carry origin in ret`);
  }
  return failures;
}

function auditHeader(file, source) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(`${file}: ${message}`);
  };
  const stripped = stripComments(source);
  need(/resolveBackHref/.test(stripped), "must use resolveBackHref for Up (ROUND 8.17 class R)");
  need(
    /navigate\(\s*resolveBackHref\(/.test(stripped) || /navigate\(\s*\n?\s*resolveBackHref\(/.test(stripped),
    "back handler must navigate(resolveBackHref({ searchParams, pathname, fallback: backHref }))",
  );
  need(
    !/hasInAppHistory/.test(stripped) && !/navigate\(\s*-1\s*\)/.test(stripped),
    "must not use hasInAppHistory or navigate(-1) — Up is structural / ret (ROUND 8.17)",
  );
  return failures;
}

const helperSource = fs.readFileSync(HELPER_FILE, "utf8");
const returnSource = fs.readFileSync(RETURN_FILE, "utf8");
let failures = [...auditHelper(helperSource), ...auditReturn(returnSource)];
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
      name: "remove resolveBackHref from layout/PageHeader",
      target: "header0",
      mutate: (t) => t.replace(/resolveBackHref/g, "MISSING"),
    },
    {
      name: "reintroduce navigate(-1) in forms/shared/PageHeader",
      target: "header1",
      mutate: (t) => t.replace(/navigate\(\s*resolveBackHref\([\s\S]*?\)\s*\)/, "navigate(-1)"),
    },
    {
      name: "returnContext drops inModuleBackHref fallback",
      target: "return",
      mutate: (t) => t.replace(/inModuleBackHref/g, "MISSING"),
    },
  ];
  let caught = 0;
  for (const { name, target, mutate } of mutations) {
    let mHelper = helperSource;
    let mReturn = returnSource;
    let mHeaders = [...headerSources];
    if (target === "helper") mHelper = mutate(helperSource);
    if (target === "return") mReturn = mutate(returnSource);
    if (target === "header0") mHeaders[0] = mutate(headerSources[0]);
    if (target === "header1") mHeaders[1] = mutate(headerSources[1]);
    const changed =
      mHelper !== helperSource ||
      mReturn !== returnSource ||
      mHeaders.some((h, i) => h !== headerSources[i]);
    if (!changed) throw new Error(`mutation "${name}" did not change any source -- test is inert`);
    const mutFailures = [
      ...auditHelper(mHelper),
      ...auditReturn(mReturn),
      ...mHeaders.flatMap((src, i) => auditHeader(HEADER_FILES[i], src)),
    ];
    if (mutFailures.length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-pageheader-smart-back-wired SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log(
  "verify-pageheader-smart-back-wired PASS — both PageHeaders use resolveBackHref (ret + inModuleBackHref fallback), never history",
);
