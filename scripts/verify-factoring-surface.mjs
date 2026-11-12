#!/usr/bin/env node
/**
 * verify-factoring-surface — ROUND 8.15b re-point.
 * Factoring.dc.html Home is FactoringHomeBoard (KPI strip → Each purchase → Terms), not the
 * layered Account Summary NotApplicable theater. Still pins:
 *   1. TAB COUNT — ≤10 Faro tabs via FARO_TABS.map
 *   2. BOARD MOUNT — FactoringHomeBoard under show("account_summary")
 *   3. NO LAYERED N/A THEATER — no BoardSection title "Account Summary" / beginning-balance N/A
 *   4. NO DEV SCHEMA NOTES as visible copy; removed verbatim notes stay gone
 *
 * --selftest mutates each load-bearing fact and requires every mutation to fail.
 */
import fs from "node:fs";

const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const LABEL = "verify-factoring-surface";
const MAX_TABS = 10;
const MANIFEST = "apps/frontend/src/router/route-manifest.ts";

function countTopLevelNavItems(src, manifestSrc = fs.readFileSync(MANIFEST, "utf8")) {
  if (/\bFactoringBoardChrome\b/.test(src) && /\bfactoringSubnavItems\b/.test(src)) {
    if (!/FARO_TABS\.map\(/.test(src)) {
      return { count: -1, error: "factoringSubnavItems must be built from FARO_TABS.map — not a hand-rolled array" };
    }
    const start = manifestSrc.indexOf("export const FARO_TABS = [");
    const end = manifestSrc.indexOf("] as const;", start);
    if (start < 0 || end < 0) return { count: -1, error: "could not read FARO_TABS in router/route-manifest.ts" };
    return { count: (manifestSrc.slice(start, end).match(/\{\s*id:\s*"/g) ?? []).length, error: null };
  }
  if (/<NavyPageSubNav\s+items=\{FARO_TABS\.map\(/.test(src)) {
    const start = manifestSrc.indexOf("export const FARO_TABS = [");
    const end = manifestSrc.indexOf("] as const;", start);
    if (start < 0 || end < 0) return { count: -1, error: "could not read FARO_TABS in router/route-manifest.ts" };
    return { count: (manifestSrc.slice(start, end).match(/\{\s*id:\s*"/g) ?? []).length, error: null };
  }
  return { count: -1, error: "FactoringHome must render FactoringBoardChrome + factoringSubnavItems from FARO_TABS" };
}

function accountSummaryShowSlice(src) {
  const marker = '{show("account_summary") ?';
  const idx = src.indexOf(marker);
  if (idx < 0) return null;
  const nextShow = src.indexOf('\n      {show("', idx + marker.length);
  return src.slice(idx, nextShow === -1 ? idx + 60000 : nextShow);
}

function analyze(src) {
  const errors = [];

  const { count, error } = countTopLevelNavItems(src);
  if (error) errors.push(`TAB COUNT: ${error}`);
  else if (count > MAX_TABS) errors.push(`TAB COUNT: FactoringHome top-level nav has ${count} items, must be <= ${MAX_TABS}`);
  else if (count <= 0) errors.push("TAB COUNT: found 0 top-level nav items — parser likely mis-anchored");

  const slice = accountSummaryShowSlice(src);
  if (!slice) {
    errors.push('could not isolate show("account_summary") block — re-anchor this guard');
    return errors;
  }

  if (!/<FactoringHomeBoard\b/.test(slice)) {
    errors.push("BOARD: show(account_summary) must mount <FactoringHomeBoard> (Factoring.dc.html Home)");
  }
  if (/title=["']Account Summary["']/.test(slice) || /title=\{["']Account Summary["']\}/.test(slice)) {
    errors.push("BOARD: must not layer BoardSection title Account Summary — board is FactoringHomeBoard only");
  }
  if (/factoring-account-summary-beginning-balance/.test(slice) || /NotApplicable reason=["']no_source["']/.test(slice)) {
    errors.push("BOARD: Account Summary NotApplicable theater must stay off Home (Payments/Fees/etc. live on their Faro tabs)");
  }
  if (!/data-testid=["']factoring-account-summary["']/.test(slice)) {
    errors.push("BOARD: keep data-testid=factoring-account-summary proof node for ending/reserve/fees/adjustments engines");
  }
  for (const id of [
    "factoring-account-summary-ending-balance",
    "factoring-account-summary-reserve-balance",
    "factoring-account-summary-fees-total",
    "factoring-account-summary-adjustments",
  ]) {
    if (!slice.includes(id)) errors.push(`BOARD: missing real-binding proof testId ${id}`);
  }

  if (src.includes("No date-range picker this pass")) errors.push('item 4a note ("No date-range picker this pass...") is back on the page');
  if (src.includes("Payments to You includes all payments due on invoices purchased during the")) {
    errors.push('item 4b footnote ("* Payments to You includes all payments due...") is back on the page');
  }

  return errors;
}

const base = { home: fs.readFileSync(HOME, "utf8") };

if (process.argv.includes("--selftest")) {
  const clean = analyze(base.home);
  if (clean.length) {
    console.error(`${LABEL} SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }

  const mutations = [];

  {
    const anchor = "() => FARO_TABS.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),";
    if (!base.home.includes(anchor)) throw new Error("selftest anchor #1 missing — re-anchor to factoringSubnavItems useMemo body");
    mutations.push([
      "factoringSubnavItems is hand-rolled to 11 tabs instead of FARO_TABS.map",
      base.home.replace(anchor, "() => [" + Array.from({ length: 11 }, (_, k) => `{ label: "T${k}", to: "/factoring/t${k}" }`).join(", ") + "],"),
    ]);
  }

  {
    const anchor = "() => FARO_TABS.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),";
    mutations.push([
      "factoringSubnavItems uses a non-FARO_TABS runtime source",
      base.home.replace(anchor, "() => EXTRA_TABS.map((x) => ({ label: x.label, to: x.to })),"),
    ]);
  }

  mutations.push([
    "FactoringHomeBoard dropped from account_summary",
    base.home.replace(/<FactoringHomeBoard\b[\s\S]*?\/>/, "<div />"),
  ]);

  mutations.push([
    "Account Summary BoardSection re-layered",
    base.home.replace(
      'data-testid="factoring-account-summary"',
      'title="Account Summary" data-testid="factoring-account-summary"',
    ),
  ]);

  mutations.push([
    "NotApplicable theater re-layered",
    base.home.replace(
      'data-testid="factoring-account-summary"',
      'data-testid="factoring-account-summary"\n<NotApplicable reason="no_source" data-testid="factoring-account-summary-beginning-balance" />',
    ),
  ]);

  mutations.push([
    "item 4a's exact removed sentence reappears verbatim",
    `${base.home}\n// No date-range picker this pass\n`,
  ]);

  let caught = 0;
  for (const [label, mutated] of mutations) {
    const errors = analyze(mutated);
    if (errors.length > 0) {
      caught += 1;
      continue;
    }
    console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS (${caught}/${mutations.length})`);
  process.exit(0);
}

const failures = analyze(base.home);
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  failures.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`${LABEL}: PASS — Faro ≤10 tabs; FactoringHomeBoard is Home; Account Summary N/A theater absent; real-binding proof nodes present`);
