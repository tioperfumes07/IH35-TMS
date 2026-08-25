#!/usr/bin/env node
/**
 * UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY — owner report (2026-08-25): "make sure that those
 * that have [a back button] take you back to the correct module, the one you went from." Both
 * PageHeader components (components/layout/PageHeader.tsx and components/forms/shared/PageHeader.tsx
 * -- genuinely different files, same defect class) preferred a static `backHref` prop over the
 * browser's real navigation history whenever it was set (79 pages across the app pass one), so a
 * page reachable from multiple places always returned to the same hardcoded parent regardless of
 * where the user actually came from.
 *
 * Fixed by adding apps/frontend/src/lib/smart-back.ts (hasInAppHistory, keyed off the empirically-
 * verified window.history.state.idx signal: 0 on a fresh load, >0 once the user has navigated
 * in-app) and wiring both PageHeader back-button handlers to prefer real history whenever it exists,
 * falling back to backHref only on a direct load/refresh. This guard asserts both wiring sites stay
 * correct and the shared helper isn't quietly removed from either.
 */
import fs from "node:fs";

const HELPER_FILE = "apps/frontend/src/lib/smart-back.ts";
const HEADER_FILES = [
  "apps/frontend/src/components/layout/PageHeader.tsx",
  "apps/frontend/src/components/forms/shared/PageHeader.tsx",
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function auditHelper(source) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const stripped = stripComments(source);
  need(
    /export function hasInAppHistory/.test(stripped),
    `${HELPER_FILE} must export hasInAppHistory`
  );
  need(
    /idx > 0/.test(stripped) || /idx>0/.test(stripped),
    `${HELPER_FILE} must require idx > 0, not just any truthy idx (0 must be falsy -- it is the direct-load signal)`
  );
  return failures;
}

function auditHeader(file, source) {
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(`${file}: ${message}`);
  };
  const stripped = stripComments(source);
  need(
    /import\s*\{\s*hasInAppHistory\s*\}\s*from\s*["'][./]*lib\/smart-back["']/.test(stripped),
    "must import hasInAppHistory from the shared smart-back helper"
  );
  need(
    /hasInAppHistory\(window\.history\.state\)/.test(stripped),
    "back-button handler must call hasInAppHistory(window.history.state) before consulting backHref"
  );
  // The hasInAppHistory check must appear BEFORE the backHref check in the click handler source
  // order, so real history genuinely wins (a check that exists but runs after backHref would never
  // fire, since backHref already returns first).
  const historyIdx = stripped.indexOf("hasInAppHistory(window.history.state)");
  const backHrefIdx = stripped.indexOf("if (backHref)");
  need(
    historyIdx >= 0 && backHrefIdx >= 0 && historyIdx < backHrefIdx,
    "the hasInAppHistory check must run BEFORE the backHref check, or backHref always wins and the fix is dead code"
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
      name: "loosen idx > 0 to any truthy idx (would make idx=0 falsy-string bugs pass wrongly, but more importantly stop guarding the direct-load case precisely)",
      target: "helper",
      mutate: (t) => t.replace("idx > 0;", "idx !== undefined;"),
    },
    {
      name: "remove hasInAppHistory import from layout/PageHeader",
      target: "header0",
      mutate: (t) => t.replace('import { hasInAppHistory } from "../../lib/smart-back";\n', ""),
    },
    {
      name: "remove hasInAppHistory import from forms/shared/PageHeader",
      target: "header1",
      mutate: (t) => t.replace('import { hasInAppHistory } from "../../../lib/smart-back";\n', ""),
    },
    {
      name: "reorder layout/PageHeader so backHref check runs first (dead-code the fix)",
      target: "header0",
      mutate: (t) =>
        t.replace(
          `if (hasInAppHistory(window.history.state)) {
                navigate(-1);
                return;
              }
              if (backHref) {
                navigate(backHref);
                return;
              }`,
          `if (backHref) {
                navigate(backHref);
                return;
              }
              if (hasInAppHistory(window.history.state)) {
                navigate(-1);
                return;
              }`
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

    const changed =
      mHelper !== helperSource || mHeaders.some((h, i) => h !== headerSources[i]);
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
  "verify-pageheader-smart-back-wired PASS — both PageHeader components prefer real in-app navigation history over a static backHref"
);
